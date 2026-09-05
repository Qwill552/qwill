import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MessageReactionDto } from '@messenger/shared';
import { createPortal } from 'react-dom';

import { useAuthStore } from '../../stores/authStore';
import { type LocalMessage, useChatStore } from '../../stores/chatStore';
import { Badge } from '../../ui/Badge';
import { startDissolve } from '../../ui/dissolve';
import { bumpScrollEpoch } from '../../ui/gestures/gestureReducer';
import { Icon } from '../../ui/Icon';
import { cssDurationMs } from '../../ui/motion';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { isServiceChat } from '../chat/serviceChat';
import { groupAlbums, mergeReactions } from '../media/albums';
import { DateDivider, UnreadDivider } from './Dividers';
import { MessageBubble } from './MessageBubble';
import { MessageReactions } from './MessageReactions';
import { isDeletableMessage } from './messageDeleting';
import {
  boundsAround,
  clampBounds,
  FEED_PREFETCH_MARGIN,
  FEED_RETRY_MS,
  FEED_SLICE_LIMIT,
  FEED_SLICE_STEP,
  sameBounds,
  shiftBounds,
  tailBounds,
  type FeedBounds,
  type FeedKeepRange,
  type FeedSide,
} from './feedWindow';
import { isEditableMessage } from './messageEditing';
import { MessageRow } from './MessageRow';
import { PinnedBanner } from './PinnedBanner';
import styles from './MessageList.module.css';

/** Сообщения одного автора ближе этого интервала визуально группируются в серию. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Насколько далеко надо уйти вверх, чтобы появилась кнопка «вниз» — в экранах. */
const JUMP_AFTER_SCREENS = 0.5;
/** Ближе этого к низу лента считается «прилипшей» и сама едет за новыми сообщениями. */
const STICK_THRESHOLD = 120;
/** Доля распада, после которой строка начинает схлопывать высоту: соседи съезжают, пока пыль ещё летит. */
const COLLAPSE_AT = 0.55;
/** Дозор на случай, если rAF встанет (вкладка ушла в фон) и распад не доиграет сам. */
const WATCHDOG_BUFFER_MS = 400;
const FOCUS_HOLD_MS = 500;
const FEED_LOAD_AHEAD_PX = 600;

interface RowAnchor {
  id: string;
  top: number;
}

function rememberAnchor(el: HTMLElement): RowAnchor | null {
  const viewTop = el.getBoundingClientRect().top;
  for (const node of el.querySelectorAll<HTMLElement>('.message-wrap')) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom <= viewTop) continue;
    const id = node.dataset.messageId;
    return id === undefined ? null : { id, top: rect.top };
  }
  return null;
}

function restoreAnchor(el: HTMLElement, anchor: RowAnchor): void {
  const node = el.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`);
  if (!node) return;
  el.scrollTop += node.getBoundingClientRect().top - anchor.top;
}

function keepRange(slice: LocalMessage[]): FeedKeepRange | null {
  let keepFromId: number | null = null;
  let keepToId: number | null = null;
  for (const message of slice) {
    if (message.id < 0) continue;
    if (keepFromId === null) keepFromId = message.id;
    keepToId = message.id;
  }
  return keepFromId === null || keepToId === null ? null : { keepFromId, keepToId };
}

function sameRows(a: LocalMessage[], b: LocalMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function lastSettledId(list: LocalMessage[]): number | null {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const id = list[i]!.id;
    if (id > 0) return id;
  }
  return null;
}

interface MessageRowData {
  message: LocalMessage;
  lastId: number;
  groupIds: number[];
  album: LocalMessage[] | null;
  reactions: MessageReactionDto[];
  sameAuthorAsPrev: boolean;
  sameAuthorAsNext: boolean;
  showDay: boolean;
}

type RowKey = string | number;

interface RenderRow {
  key: RowKey;
  row: MessageRowData;
  own: boolean;
  read: boolean;
  isReal: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  canReply: boolean;
  canReact: boolean;
  isPinned: boolean;
  showUnread: boolean;
}

interface LeavingRow {
  entry: RenderRow;
  index: number;
}

interface DaySection {
  key: RowKey;
  iso: string;
  entries: RenderRow[];
}

/** Ключ строки держится за `albumId`, а не за id первого сообщения: удаление первого снимка
 *  альбома иначе сменило бы ключ и пересоздало строку целиком вместо перекладки мозаики.
 *  Порядковый суффикс нужен альбому длиннее десяти — `groupAlbums` рвёт его на две строки
 *  с одним и тем же `albumId`. */
function rowKeyFor(row: MessageRowData, albumSeen: Map<string, number>): RowKey {
  const albumId = row.message.albumId;
  if (albumId === null) return row.message.clientId ?? row.message.id;
  const seen = albumSeen.get(albumId) ?? 0;
  albumSeen.set(albumId, seen + 1);
  return seen === 0 ? albumId : `${albumId}#${seen}`;
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Прочитано всеми, кроме автора, — курсоры участников есть всегда, даже «никогда не читал» (null). */
function isReadByOthers(
  cursors: Record<string, number | null> | undefined,
  myId: string | null,
  messageId: number,
): boolean {
  if (!cursors) return false;
  const others = Object.entries(cursors).filter(([userId]) => userId !== myId);
  if (others.length === 0) return false;
  return others.every(([, cursor]) => cursor !== null && cursor !== undefined && cursor >= messageId);
}

export function MessageList({
  chatId,
  isGroup,
  typing,
  emojiPanelOpen,
  onReply,
  onEdit,
  onForwardRequest,
  pinnedSlot,
}: {
  chatId: string;
  isGroup: boolean;
  /** Буквально `sc-if value="{{ typing }}"` из референса (строка 344) — три скачущие точки
   *  внизу ленты, отдельно от статуса «печатает…» в капсуле шапки. */
  typing: boolean;
  emojiPanelOpen: boolean;
  onReply: (message: LocalMessage) => void;
  onEdit: (message: LocalMessage) => void;
  /** Открывает шит выбора чата-получателя (ux-ui/06) — владеет им ChatScreen, чтобы им же
   *  могла пользоваться и панель мультивыбора, а не только пункт меню одной строки. */
  onForwardRequest: (messageIds: number[]) => void;
  /** Узел вне скроллящейся ленты, куда порталится баннер закрепа — иначе он оказался бы
   *  под блюром шапки (ChatScreen.pinnedSlot, ux-ui.md, журнал, этап 6). */
  pinnedSlot: HTMLDivElement | null;
}) {
  const messages = useChatStore((s) => s.messagesByChat[chatId]) ?? [];
  const hasMore = useChatStore((s) => s.hasMoreByChat[chatId]) ?? false;
  const hasMoreAfter = useChatStore((s) => s.hasMoreAfterByChat[chatId]) ?? false;
  const focus = useChatStore((s) => s.focusByChat[chatId]) ?? null;
  const feedEpoch = useChatStore((s) => s.feedEpochByChat[chatId]) ?? 0;
  const loadMoreAfter = useChatStore((s) => s.loadMoreAfter);
  const jumpToLatest = useChatStore((s) => s.jumpToLatest);
  const reconciled = useChatStore((s) => s.hasMoreByChat[chatId] !== undefined);
  const historyState = useChatStore((s) => s.historyByChat[chatId]) ?? 'loading';
  const loadMore = useChatStore((s) => s.loadMore);
  const prefetchFeed = useChatStore((s) => s.prefetchFeed);
  const readCursors = useChatStore((s) => s.readCursorsByChat[chatId]);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const pinMessage = useChatStore((s) => s.pinMessage);
  const pinnedMessage = useChatStore((s) => s.pinnedByChat[chatId]) ?? null;
  const members = useChatStore((s) => s.membersByChat[chatId]);
  const loadMembers = useChatStore((s) => s.loadMembers);
  const unreadCount = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.unreadCount ?? 0);
  const isService = useChatStore((s) => isServiceChat(s.chats.find((c) => c.id === chatId)));
  const myId = useAuthStore((s) => s.user?.id) ?? null;

  // Права на «Удалить чужое»/«Закрепить» в группе завязаны на роль участника (membersByChat) —
  // без явной загрузки они появляются только после того, как пользователь откроет GroupPanel
  // хотя бы раз за сессию (единственное другое место, вызывающее loadMembers).
  useEffect(() => {
    if (isGroup) void loadMembers(chatId);
  }, [chatId, isGroup, loadMembers]);

  const feedKey = `${chatId}#${feedEpoch}`;

  const listRef = useRef<HTMLDivElement>(null);
  const appearSeen = useRef<WeakSet<HTMLElement>>(new WeakSet());
  const stuckToBottom = useRef(true);
  const prevLastId = useRef<number | null>(null);
  const wasNewest = useRef(true);
  const settledFeedKey = useRef<string | null>(null);
  const suppressAppear = useRef(false);
  const pendingAnchor = useRef<RowAnchor | null>(null);
  const topTriggerRef = useRef<HTMLDivElement>(null);
  const bottomTriggerRef = useRef<HTMLDivElement>(null);
  const loadingUp = useRef(false);
  const loadingDown = useRef(false);
  const retryUpAt = useRef(0);
  const retryDownAt = useRef(0);
  const pendingTail = useRef(false);
  const prefetchSide = useRef<FeedSide>('older');
  const [showJump, setShowJump] = useState(false);

  const [bounds, setBounds] = useState<FeedBounds>({ fromId: null, toId: null });
  const boundsFeedRef = useRef(feedKey);
  const boundsFocusRef = useRef(focus?.seq ?? 0);

  let liveBounds = bounds;
  if (boundsFeedRef.current !== feedKey) {
    boundsFeedRef.current = feedKey;
    boundsFocusRef.current = focus?.seq ?? 0;
    liveBounds = focus
      ? boundsAround(messages, focus.messageId, FEED_SLICE_LIMIT)
      : tailBounds(messages, FEED_SLICE_LIMIT);
    setBounds(liveBounds);
  } else if (focus && boundsFocusRef.current !== focus.seq) {
    boundsFocusRef.current = focus.seq;
    liveBounds = boundsAround(messages, focus.messageId, FEED_SLICE_LIMIT);
    setBounds(liveBounds);
  }

  const view = useMemo(() => clampBounds(messages, liveBounds, FEED_SLICE_LIMIT), [messages, liveBounds]);
  const sliceRef = useRef<LocalMessage[]>([]);
  const nextSlice = messages.slice(view.from, view.to + 1);
  if (!sameRows(sliceRef.current, nextSlice)) sliceRef.current = nextSlice;
  const slice = sliceRef.current;
  const sliceSignature = `${feedKey}:${slice[0]?.id ?? 0}:${slice[slice.length - 1]?.id ?? 0}:${slice.length}`;
  const isViewportNewest = view.to >= messages.length - 1 && !hasMoreAfter;

  const myRole = members?.find((m) => m.userId === myId)?.role;
  const isGroupAdmin = isGroup && (myRole === 'OWNER' || myRole === 'ADMIN');
  /** Приватный чат — закреплять может любой участник; группа — только OWNER/ADMIN
   *  (тот же порог, что и на сервере, chat.ts → pinMessage). */
  const canPinBase = !isGroup || isGroupAdmin;

  /** Граница непрочитанного фиксируется один раз на вход в чат: если пересчитывать её
   *  на каждое сообщение, линия убегает от глаз по мере чтения. */
  const unreadAnchor = useRef<number | null>(null);
  if (unreadAnchor.current === null && messages.length > 0) {
    unreadAnchor.current = unreadCount > 0 ? (messages[messages.length - unreadCount]?.id ?? null) : null;
  }
  useEffect(() => {
    unreadAnchor.current = null;
  }, [feedKey]);

  /** Скроллим сам контейнер, а не через scrollIntoView: тот тянет за собой все скроллящиеся
   *  предки, и однажды уже утащил вниз всю оболочку вместе с плавающей хромой. */
  function scrollToBottom(smooth: boolean): void {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  /** Баннер закрепа — та же логика: не scrollIntoView (см. журнал ux-ui.md, этап 2), а свой
   *  scrollTo по измеренному offsetTop. Молча ничего не делает, если сообщение не догружено
   *  в текущую страницу истории — догрузки по id пока нет (вне объёма этого этапа). */
  function rowNodeFor(el: HTMLDivElement, messageId: number): HTMLElement | null {
    const exact = el.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (exact) return exact;
    let candidate: HTMLElement | null = null;
    for (const node of el.querySelectorAll<HTMLElement>('[data-message-id]')) {
      const id = Number(node.dataset.messageId);
      if (id > 0 && id <= messageId) candidate = node;
    }
    return candidate;
  }

  function scrollToMessage(messageId: number): void {
    const el = listRef.current;
    const target = el?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!el || !target) return;
    const top = target.offsetTop - el.clientHeight / 2 + target.clientHeight / 2;
    el.scrollTo({ top, behavior: 'smooth' });
  }

  useLayoutEffect(() => {
    if (settledFeedKey.current === feedKey || messages.length === 0) return;
    const replaced = settledFeedKey.current?.startsWith(`${chatId}#`) ?? false;
    settledFeedKey.current = feedKey;
    prevLastId.current = messages[messages.length - 1]?.id ?? null;
    retryUpAt.current = 0;
    retryDownAt.current = 0;
    if (replaced) suppressAppear.current = true;
    if (focus) {
      stuckToBottom.current = false;
      return;
    }
    stuckToBottom.current = true;
    setShowJump(false);
    scrollToBottom(false);
  }, [feedKey, chatId, messages.length, focus]);

  useLayoutEffect(() => {
    if (!focus) return;
    const el = listRef.current;
    if (!el) return;
    const target = rowNodeFor(el, focus.messageId);
    if (!target) return;

    stuckToBottom.current = false;
    function place(): void {
      el!.scrollTop = Math.max(0, target!.offsetTop - el!.clientHeight / 3);
    }
    place();
    target.dataset.flash = '1';
    const flashTimer = window.setTimeout(() => delete target.dataset.flash, cssDurationMs('--dur-flash'));

    const observer = new ResizeObserver(place);
    for (const node of el.querySelectorAll<HTMLElement>('.message-wrap')) observer.observe(node);

    function release(): void {
      observer.disconnect();
      el!.removeEventListener('pointerdown', release);
      el!.removeEventListener('wheel', release);
      el!.removeEventListener('touchstart', release);
    }
    el.addEventListener('pointerdown', release);
    el.addEventListener('wheel', release, { passive: true });
    el.addEventListener('touchstart', release, { passive: true });
    const holdTimer = window.setTimeout(release, FOCUS_HOLD_MS);

    return () => {
      window.clearTimeout(flashTimer);
      window.clearTimeout(holdTimer);
      release();
    };
  }, [focus]);

  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (settledFeedKey.current !== feedKey) {
      prevLastId.current = lastId;
      wasNewest.current = isViewportNewest;
      return;
    }
    if (lastId !== prevLastId.current && wasNewest.current && stuckToBottom.current) scrollToBottom(true);
    prevLastId.current = lastId;
    wasNewest.current = isViewportNewest;
  }, [feedKey, messages, isViewportNewest]);

  useEffect(() => {
    if (typing && stuckToBottom.current) scrollToBottom(true);
  }, [typing]);

  // Резерв места под композер едет CSS-переходом (--dur-menu), а прокрутка за ним сама не
  // идёт: плавный scrollTo тут не годится — у него своя, неуправляемая длительность, и лента
  // догоняла бы уже уехавший композер. Вместо этого низ ленты прижимается каждый кадр, пока
  // идёт переход, — последний пузырь остаётся приклеен к композеру всё время движения.
  useEffect(() => {
    const node = listRef.current;
    if (!node || !stuckToBottom.current) return;
    const ms = cssDurationMs('--dur-menu');
    const until = performance.now() + ms;
    let frame = 0;
    function pinToBottom(): void {
      node!.scrollTop = node!.scrollHeight;
      if (performance.now() < until) frame = requestAnimationFrame(pinToBottom);
    }
    pinToBottom();
    return () => cancelAnimationFrame(frame);
  }, [emojiPanelOpen]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (pendingTail.current) {
      pendingTail.current = false;
      pendingAnchor.current = null;
      stuckToBottom.current = true;
      setShowJump(false);
      scrollToBottom(false);
      return;
    }
    const anchor = pendingAnchor.current;
    if (!anchor) return;
    pendingAnchor.current = null;
    restoreAnchor(el, anchor);
    stuckToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    if (loadingUp.current || loadingDown.current) pendingAnchor.current = rememberAnchor(el);
  }, [sliceSignature]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const seen = appearSeen.current;
    const suppressed = suppressAppear.current;
    suppressAppear.current = false;
    const appearing: HTMLElement[] = [];
    let viewTop = 0;
    let viewBottom = 0;
    let measuredView = false;
    for (const node of el.querySelectorAll<HTMLElement>('.message-wrap')) {
      if (seen.has(node)) continue;
      seen.add(node);
      if (suppressed) continue;
      if (!measuredView) {
        const view = el.getBoundingClientRect();
        viewTop = view.top;
        viewBottom = view.bottom;
        measuredView = true;
      }
      const rect = node.getBoundingClientRect();
      if (rect.bottom > viewTop && rect.top < viewBottom) appearing.push(node);
    }
    for (const node of appearing) node.dataset.appear = '1';
  });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stuckToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [chatId]);

  function requestUp(): void {
    const el = listRef.current;
    if (!el || !hasMore || view.from > 0 || loadingUp.current || performance.now() < retryUpAt.current) return;
    loadingUp.current = true;
    pendingAnchor.current = rememberAnchor(el);
    if (liveBounds.toId === null) {
      const tail = lastSettledId(messages);
      if (tail !== null) setBounds({ fromId: null, toId: tail });
    }
    loadMore(chatId, keepRange(slice))
      .catch(() => {
        pendingAnchor.current = null;
        retryUpAt.current = performance.now() + FEED_RETRY_MS;
      })
      .finally(() => {
        loadingUp.current = false;
      });
  }

  function requestDown(): void {
    const el = listRef.current;
    if (!el || !hasMoreAfter || view.to < messages.length - 1) return;
    if (loadingDown.current || performance.now() < retryDownAt.current) return;
    loadingDown.current = true;
    pendingAnchor.current = rememberAnchor(el);
    if (liveBounds.toId !== null) setBounds({ fromId: liveBounds.fromId, toId: null });
    loadMoreAfter(chatId, keepRange(slice))
      .catch(() => {
        pendingAnchor.current = null;
        retryDownAt.current = performance.now() + FEED_RETRY_MS;
      })
      .finally(() => {
        loadingDown.current = false;
      });
  }

  function growSlice(side: FeedSide): boolean {
    const el = listRef.current;
    if (!el) return false;
    const next = shiftBounds(messages, liveBounds, side, FEED_SLICE_STEP, FEED_SLICE_LIMIT);
    if (sameBounds(next, liveBounds)) return false;
    pendingAnchor.current = rememberAnchor(el);
    setBounds(next);
    return true;
  }

  function nearEdge(side: FeedSide): void {
    prefetchSide.current = side;
    if (growSlice(side)) return;
    if (side === 'older') requestUp();
    else requestDown();
  }

  const nearEdgeRef = useRef(nearEdge);
  nearEdgeRef.current = nearEdge;

  useEffect(() => {
    const side = prefetchSide.current;
    const unseen = side === 'older' ? view.from : messages.length - 1 - view.to;
    prefetchFeed(chatId, side, FEED_PREFETCH_MARGIN - unseen, keepRange(slice));
  }, [chatId, messages, view, slice, prefetchFeed]);

  useEffect(() => {
    const el = listRef.current;
    const top = topTriggerRef.current;
    const bottom = bottomTriggerRef.current;
    if (!el || !top || !bottom) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          nearEdgeRef.current(entry.target === top ? 'older' : 'newer');
        }
      },
      { root: el, rootMargin: `${FEED_LOAD_AHEAD_PX}px 0px ${FEED_LOAD_AHEAD_PX}px 0px` },
    );
    observer.observe(top);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, [chatId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || el.scrollHeight >= el.clientHeight * 2) return;
    nearEdgeRef.current('older');
    nearEdgeRef.current('newer');
  }, [sliceSignature]);

  function handleScroll(): void {
    const el = listRef.current;
    if (!el) return;
    // Скролл отменяет любой висящий жест сообщения — long-press/окно двойного тапа
    // (ux-ui/gestures.md, «Общие правила», п.2; см. ui/gestures/gestureReducer.ts).
    bumpScrollEpoch();
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stuckToBottom.current = distance < STICK_THRESHOLD;
    if (distance > el.clientHeight * JUMP_AFTER_SCREENS) setShowJump(true);
    else if (distance < STICK_THRESHOLD) setShowJump(false);

    const ahead = Math.max(FEED_LOAD_AHEAD_PX, el.clientHeight);
    if (el.scrollTop < ahead) nearEdge('older');
    if (distance < ahead) nearEdge('newer');
  }

  function handleJump(): void {
    if (!hasMoreAfter) {
      if (view.to >= messages.length - 1) {
        scrollToBottom(true);
        return;
      }
      pendingTail.current = true;
      setBounds(tailBounds(messages, FEED_SLICE_LIMIT));
      return;
    }
    void jumpToLatest(chatId);
  }

  const rows = useMemo(() => {
    const albums = groupAlbums(slice);

    return albums.flatMap((album, index) => {
      const message = album[0];
      const last = album[album.length - 1];
      if (!message || !last) return [];

      const previousAlbum = albums[index - 1];
      const prev = previousAlbum?.[previousAlbum.length - 1];
      const next = albums[index + 1]?.[0];

      const sameAuthorAsPrev =
        !!prev &&
        prev.sender?.id === message.sender?.id &&
        isSameDay(prev.createdAt, message.createdAt) &&
        new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;

      const sameAuthorAsNext =
        !!next &&
        next.sender?.id === message.sender?.id &&
        isSameDay(next.createdAt, message.createdAt) &&
        new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() < GROUP_WINDOW_MS;

      return [
        {
          message,
          lastId: last.id,
          groupIds: album.map((item) => item.id),
          album: album.length > 1 ? album : null,
          reactions: mergeReactions(album),
          sameAuthorAsPrev,
          sameAuthorAsNext,
          showDay: !prev || !isSameDay(prev.createdAt, message.createdAt),
        },
      ];
    });
  }, [slice]);

  const renderRows = useMemo<RenderRow[]>(() => {
    const albumSeen = new Map<string, number>();

    return rows.map((row) => {
      const own = row.message.sender?.id === myId;
      const delivered = row.message.status !== 'sending' && row.message.status !== 'failed';
      const isReal = row.message.id > 0;
      const canAct = isReal && !row.message.deletedAt;

      return {
        key: rowKeyFor(row, albumSeen),
        row,
        own,
        read: own && delivered && isReadByOthers(readCursors, myId, row.lastId),
        isReal,
        canEdit: own && canAct && isEditableMessage(row.message),
        canDelete: isDeletableMessage(row.message, myId, isGroupAdmin),
        canPin: canPinBase && canAct,
        canReply: !isService,
        canReact: !isService,
        isPinned: pinnedMessage !== null && row.groupIds.includes(pinnedMessage.id),
        showUnread: unreadAnchor.current !== null && row.groupIds.includes(unreadAnchor.current),
      };
    });
  }, [rows, myId, readCursors, isGroupAdmin, canPinBase, isService, pinnedMessage]);

  // Удалённое сообщение уходит из стора мгновенно, но не из ленты: строка задерживается
  // здесь замороженной, пока не доиграет распад. Диффим прямо в рендере, а не в эффекте, —
  // React успевает вернуть строку до коммита, поэтому её узел не пересоздаётся: иначе он
  // потерял бы загруженную картинку и заново проиграл входную анимацию `bubIn`.
  const [leavingRows, setLeavingRows] = useState<Map<RowKey, LeavingRow>>(() => new Map());
  const prevRenderRowsRef = useRef<RenderRow[]>(renderRows);
  const prevRowsFeedKeyRef = useRef<string>(feedKey);
  const prevReconciledRef = useRef<boolean>(reconciled);
  const previousRows = prevRenderRowsRef.current;
  const sameFeed = prevRowsFeedKeyRef.current === feedKey;
  const wasReconciled = prevReconciledRef.current;
  prevRenderRowsRef.current = renderRows;
  prevRowsFeedKeyRef.current = feedKey;
  prevReconciledRef.current = reconciled;

  if (!sameFeed) {
    if (leavingRows.size > 0) setLeavingRows(new Map());
  } else if (previousRows !== renderRows || leavingRows.size > 0) {
    const liveKeys = new Set(renderRows.map((entry) => entry.key));
    const gone = wasReconciled
      ? previousRows.filter((entry) => !liveKeys.has(entry.key) && !leavingRows.has(entry.key))
      : [];
    const revived = [...leavingRows.keys()].filter((key) => liveKeys.has(key));

    if (gone.length > 0 || revived.length > 0) {
      setLeavingRows((current) => {
        const next = new Map(current);
        for (const key of revived) next.delete(key);
        for (const entry of gone) {
          const index = previousRows.indexOf(entry);
          next.set(entry.key, {
            index,
            entry: {
              ...entry,
              row: { ...entry.row, showDay: false },
              showUnread: false,
              canEdit: false,
              canDelete: false,
              canPin: false,
              canReply: false,
              canReact: false,
            },
          });
        }
        return next;
      });
    }
  }

  const handleLeaveDone = useCallback((key: RowKey) => {
    setLeavingRows((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  const displayEntries = useMemo(() => {
    if (leavingRows.size === 0) return renderRows;
    const result = [...renderRows];
    for (const leaving of [...leavingRows.values()].sort((a, b) => a.index - b.index)) {
      result.splice(Math.min(leaving.index, result.length), 0, leaving.entry);
    }
    return result;
  }, [renderRows, leavingRows]);

  const daySections = useMemo<DaySection[]>(() => {
    const sections: DaySection[] = [];
    for (const entry of displayEntries) {
      const current = sections[sections.length - 1];
      if (!current || entry.row.showDay) {
        sections.push({ key: `day-${entry.key}`, iso: entry.row.message.createdAt, entries: [entry] });
      } else {
        current.entries.push(entry);
      }
    }
    return sections;
  }, [displayEntries]);

  return (
    <>
      {pinnedMessage &&
        pinnedSlot &&
        createPortal(
          <PinnedBanner
            message={pinnedMessage}
            canUnpin={canPinBase}
            onJump={() => scrollToMessage(pinnedMessage.id)}
            onUnpin={() => pinMessage(chatId, null)}
          />,
          pinnedSlot,
        )}

      <div
        className={`${styles.list} hide-native-scrollbar`}
        ref={listRef}
        data-message-scroller="true"
        onScroll={handleScroll}
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('a[href]')) {
            event.preventDefault();
            return;
          }
          if (target.closest('[data-selectable]')) return;
          event.preventDefault();
        }}
      >
        <ScrollIndicator target={listRef} interactive />

        <div className={styles.filler} />

        <div className={styles.trigger} ref={topTriggerRef} aria-hidden="true" />

        {displayEntries.length === 0 && !hasMore && historyState === 'ready' && (
          <p className={styles.empty}>Сообщений пока нет. Напишите первым.</p>
        )}

        {displayEntries.length === 0 && historyState === 'offline' && (
          <p className={styles.empty}>Нет связи. История не загружена.</p>
        )}

        {daySections.map((section) => (
          <div key={section.key} className={styles.daySection}>
            <DateDivider iso={section.iso} />
            {section.entries.map((entry) => (
              <MessageListRow
                key={entry.key}
                entry={entry}
                leaving={leavingRows.has(entry.key)}
                chatId={chatId}
                myId={myId}
                isGroup={isGroup}
                unreadCount={unreadCount}
                onReply={onReply}
                onEdit={onEdit}
                onForwardRequest={onForwardRequest}
                onToggleReaction={toggleReaction}
                onLeaveDone={handleLeaveDone}
                listRef={listRef}
                stuckToBottomRef={stuckToBottom}
              />
            ))}
          </div>
        ))}

        <div className={styles.trigger} ref={bottomTriggerRef} aria-hidden="true" />

        {typing && (
          <div className={styles.typingRow}>
            <div className={styles.typingBubble}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}

        <div className={styles.spacer} />
      </div>

      <button
        type="button"
        className={`${styles.jump} ${showJump || !isViewportNewest ? '' : styles.jumpHidden}`}
        aria-label="К последним сообщениям"
        tabIndex={showJump || !isViewportNewest ? 0 : -1}
        onClick={handleJump}
      >
        <Icon name="chevron-down" size={22} />
        <Badge count={unreadCount} small className={styles.jumpBadge} />
      </button>
    </>
  );
}

/** Строка сообщения — буквально `justify-content:{{m.align}}` из референса (строка 331):
 *  пузырь встаёт у своего края. Этап 6 достроил вокруг неё разведение жестов из
 *  gestures.md (тап/двойной тап/long-press/свайп-ответ), контекстное меню и мультивыбор.
 *  Обёртка `.shell` есть всегда, а не появляется на время ухода: смена формы дерева
 *  пересоздала бы узел строки со всеми последствиями (см. `leavingRows` выше). */
const MessageListRow = memo(function MessageListRow({
  entry,
  leaving,
  chatId,
  myId,
  isGroup,
  unreadCount,
  onReply,
  onEdit,
  onForwardRequest,
  onToggleReaction,
  onLeaveDone,
  listRef,
  stuckToBottomRef,
}: {
  entry: RenderRow;
  leaving: boolean;
  chatId: string;
  myId: string | null;
  isGroup: boolean;
  unreadCount: number;
  onReply: (message: LocalMessage) => void;
  onEdit: (message: LocalMessage) => void;
  onForwardRequest: (messageIds: number[]) => void;
  onToggleReaction: (chatId: string, messageId: number, emoji: string) => void;
  onLeaveDone: (key: RowKey) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  stuckToBottomRef: React.RefObject<boolean>;
}) {
  const { row, own, read, isReal, canEdit, canDelete, canPin, canReply, canReact, isPinned, showUnread } = entry;
  const { message, groupIds, album, reactions, sameAuthorAsPrev, sameAuthorAsNext } = row;

  const shellRef = useRef<HTMLDivElement>(null);
  const [collapsing, setCollapsing] = useState(false);

  useLayoutEffect(() => {
    if (!leaving) return;
    const node = shellRef.current;
    if (!node) {
      onLeaveDone(entry.key);
      return;
    }

    const dissolveMs = cssDurationMs('--dur-dissolve');
    let done = false;
    function finish(): void {
      if (done) return;
      done = true;
      onLeaveDone(entry.key);
    }

    node.style.height = `${node.offsetHeight}px`;

    // Схлопывание высоты утащило бы за собой ленту, если удалённое сообщение выше
    // видимой области: возвращаем прокрутке ровно то, что теряет строка, каждый кадр.
    const list = listRef.current;
    let observer: ResizeObserver | null = null;
    if (list && !stuckToBottomRef.current && node.offsetTop < list.scrollTop) {
      let lastHeight = node.offsetHeight;
      observer = new ResizeObserver((entries) => {
        const height = entries[0]?.contentRect.height;
        if (height === undefined) return;
        const delta = lastHeight - height;
        lastHeight = height;
        if (delta !== 0) list.scrollTop -= delta;
      });
      observer.observe(node);
    }

    const cancelDissolve = startDissolve(node, { durationMs: dissolveMs, onDone: finish });
    const collapseTimer = setTimeout(() => setCollapsing(true), dissolveMs * COLLAPSE_AT);
    const watchdog = setTimeout(finish, dissolveMs + WATCHDOG_BUFFER_MS);

    return () => {
      clearTimeout(collapseTimer);
      clearTimeout(watchdog);
      observer?.disconnect();
      cancelDissolve();
      setCollapsing(false);
      node.style.height = '';
      node.style.opacity = '';
    };
  }, [leaving, entry.key, onLeaveDone, listRef, stuckToBottomRef]);

  useLayoutEffect(() => {
    if (!collapsing) return;
    const node = shellRef.current;
    if (node) node.style.height = '0px';
  }, [collapsing]);

  return (
    <>
      {showUnread && <UnreadDivider count={unreadCount} />}

      <div
        ref={shellRef}
        className={`${leaving ? styles.shellLeaving : ''} ${collapsing ? styles.shellCollapsing : ''}`}
      >
        <MessageRow
          own={own}
          sender={message.sender}
          withAvatarColumn={isGroup}
          showAvatar={!sameAuthorAsNext}
          message={message}
          groupIds={groupIds}
          reactions={reactions}
          chatId={chatId}
          myId={myId}
          read={read}
          canEdit={canEdit}
          canDelete={canDelete}
          canPin={canPin}
          canReply={canReply}
          canReact={canReact}
          isPinned={isPinned}
          onReply={onReply}
          onEdit={onEdit}
          onForwardRequest={onForwardRequest}
        >
          <MessageBubble
            message={message}
            own={own}
            read={read}
            showAuthor={isGroup && !own && !sameAuthorAsPrev}
            album={album ?? undefined}
          >
            {isReal && (
              <MessageReactions
                reactions={reactions}
                myId={myId}
                chatId={chatId}
                onToggle={(emoji) => onToggleReaction(chatId, message.id, emoji)}
              />
            )}
          </MessageBubble>
        </MessageRow>
      </div>
    </>
  );
});
