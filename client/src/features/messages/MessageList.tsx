import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MessageReactionDto } from '@messenger/shared';
import { createPortal, flushSync } from 'react-dom';

import { chatCalendarRequest } from '../../api/chats';
import { onBottomInset, registerInsetMover } from '../../app/bottomInset';
import { useLayoutMode } from '../../app/useLayoutMode';
import { useAuthStore } from '../../stores/authStore';
import { useChatSearchStore } from '../../stores/chatSearchStore';
import { useHiddenPinsStore } from '../../stores/hiddenPinsStore';
import { type LocalMessage, useChatStore } from '../../stores/chatStore';
import { Badge } from '../../ui/Badge';
import { startDissolve } from '../../ui/dissolve';
import { bumpScrollEpoch } from '../../ui/gestures/gestureReducer';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { cssDurationMs } from '../../ui/motion';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { dayKeyOfIso } from '../calendar/calendarDates';
import { ChatCalendar } from '../calendar/ChatCalendar';
import { isServiceChat } from '../chat/serviceChat';
import { focusMessageInChat } from '../chat/showInChat';
import { groupAlbums, mergeReactions } from '../media/albums';
import { MediaFeedContext, useMediaFeedScope } from '../media/mediaFeedScope';
import { DateDivider, FloatingDate, UnreadDivider } from './Dividers';
import { MessageBubble } from './MessageBubble';
import { MessageReactions } from './MessageReactions';
import { isDeletableMessage } from './messageDeleting';
import {
  FEED_PREFETCH_MARGIN,
  FEED_RETRY_MS,
  FEED_SENSITIVE_AREA_PX,
  FEED_SLICE_LIMIT,
  selectDeletedRows,
  type FeedKeepRange,
  type FeedSide,
  type FeedSlice,
} from './feedWindow';
import {
  buildHeightTable,
  heightsOf,
  rowHeight,
  rowTop,
  sameWindow,
  skeletonsAbove,
  skeletonsBelow,
  totalHeight,
  windowAtEnd,
  windowAtOffset,
  windowAround,
} from './feedHeights';
import { isTailArrival, shouldFollowTail } from './feedFollow';
import { attachFlingTakeover, flingDistance, MAX_FLING_VELOCITY, type FlingTakeover } from './flingTakeover';
import { isEditableMessage } from './messageEditing';
import { MessageRow } from './MessageRow';
import { PinnedBanner } from './PinnedBanner';
import { SelectionDragContext } from './selectionDrag';
import { UnpinMessageModal } from './UnpinMessageModal';
import { useSelectionDrag } from './useSelectionDrag';
import { stickyDate } from './stickyDate';
import { ReadTracker, unreadBetween } from './unreadEntry';
import styles from './MessageList.module.css';

/** Сообщения одного автора ближе этого интервала визуально группируются в серию. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Насколько далеко надо уйти вверх, чтобы появилась кнопка «вниз» — в экранах. */
const JUMP_AFTER_SCREENS = 0.5;
const STICK_THRESHOLD = 120;
const BOTTOM_SNAP = 8;
const FOLLOW_THRESHOLD = 50;
const SCROLL_ANIMATE_SCREENS = 2;
/** Доля распада, после которой строка начинает схлопывать высоту: соседи съезжают, пока пыль ещё летит. */
const COLLAPSE_AT = 0.55;
/** Дозор на случай, если rAF встанет (вкладка ушла в фон) и распад не доиграет сам. */
const WATCHDOG_BUFFER_MS = 400;
const FOCUS_HOLD_MS = 500;
/** Восстановленное место держим дольше: строки выше якоря дорастают до своей высоты по мере
 *  загрузки картинок, а `overflow-anchor` у ленты выключен — без этого лента уползает вверх. */
const RESTORE_HOLD_MS = 1200;
const FLOATING_DATE_HIDE_MS = 1000;
const DAY_DIVIDER_ESTIMATE = 38;
const SCROLL_IDLE_MS = 150;
const AUTO_SCROLL_GUARD_MS = 700;
const JUMP_TRAVEL_MS = 900;
const JUMP_HOLD_MS = 1200;
const JUMP_EASE_MS = 90;
const JUMP_MISSING_MS = 500;
const TYPING_BUBBLE_IN_FEED: boolean = false;
const COMPOSER_RESERVE = 40;

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
  const drift = node.getBoundingClientRect().top - anchor.top;
  if (Math.abs(drift) <= 1) return;
  el.scrollTop += drift;
}

function bottomReserve(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).paddingBottom) || 0;
}

function visibleEdges(el: HTMLElement): { top: number; bottom: number } {
  const style = getComputedStyle(el);
  const top = parseFloat(style.paddingTop) || 0;
  const bottom = el.clientHeight - Math.max(0, (parseFloat(style.paddingBottom) || 0) - COMPOSER_RESERVE);
  return { top, bottom: Math.max(top, bottom) };
}

function visibleCenter(el: HTMLElement): number {
  const edges = visibleEdges(el);
  return (edges.top + edges.bottom) / 2;
}

function predictedPrefetchRows(beltVelocity: number, averageRowHeight: number): number {
  const speed = Math.min(MAX_FLING_VELOCITY, Math.abs(beltVelocity));
  if (speed === 0) return 0;
  return Math.ceil(flingDistance(speed) / averageRowHeight);
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

interface MessageRowData {
  message: LocalMessage;
  lastId: number;
  groupIds: number[];
  album: LocalMessage[] | null;
  reactions: MessageReactionDto[];
  sameAuthorAsPrev: boolean;
  sameAuthorAsNext: boolean;
  showDay: boolean;
  firstIndex: number;
  lastIndex: number;
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

interface FloatingDateState {
  iso: string;
  hidden: boolean;
  instant: boolean;
}

function isSameDayOrBefore(a: string, b: string): boolean {
  const day = new Date(b);
  day.setHours(23, 59, 59, 999);
  return new Date(a).getTime() <= day.getTime();
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

const MENTION_READ_INTERVAL_MS = 500;

export function MessageList({
  chatId,
  isGroup,
  typing,
  onReply,
  onEdit,
  onForwardRequest,
  pinnedSlot,
  pinnedVisible,
  topInsetKey,
}: {
  chatId: string;
  isGroup: boolean;
  /** Буквально `sc-if value="{{ typing }}"` из референса (строка 344) — три скачущие точки
   *  внизу ленты, отдельно от статуса «печатает…» в капсуле шапки. */
  typing: boolean;
  onReply: (message: LocalMessage) => void;
  onEdit: (message: LocalMessage) => void;
  /** Открывает шит выбора чата-получателя (ux-ui/06) — владеет им ChatScreen, чтобы им же
   *  могла пользоваться и панель мультивыбора, а не только пункт меню одной строки. */
  onForwardRequest: (messageIds: number[]) => void;
  /** Узел вне скроллящейся ленты, куда порталится баннер закрепа — иначе он оказался бы
   *  под блюром шапки (ChatScreen.pinnedSlot, ux-ui.md, журнал, этап 6). */
  pinnedSlot: HTMLDivElement | null;
  pinnedVisible: boolean;
  topInsetKey: string;
}) {
  const messages = useChatStore((s) => s.messagesByChat[chatId]) ?? [];
  const hasMore = useChatStore((s) => s.hasMoreByChat[chatId]) ?? false;
  const hasMoreAfter = useChatStore((s) => s.hasMoreAfterByChat[chatId]) ?? false;
  const searchInChat = useChatSearchStore((s) => s.open && s.chatId === chatId && s.mode === 'chat');
  const mobileLayout = useLayoutMode() === 'mobile';
  const searchArrowsShown = searchInChat && mobileLayout;
  const focus = useChatStore((s) => s.focusByChat[chatId]) ?? null;
  const feedEpoch = useChatStore((s) => s.feedEpochByChat[chatId]) ?? 0;
  const loadMoreAfter = useChatStore((s) => s.loadMoreAfter);
  const reconciled = useChatStore((s) => s.hasMoreByChat[chatId] !== undefined);
  const historyState = useChatStore((s) => s.historyByChat[chatId]) ?? 'loading';
  const loadMore = useChatStore((s) => s.loadMore);
  const prefetchFeed = useChatStore((s) => s.prefetchFeed);
  const trimFeed = useChatStore((s) => s.trimFeed);
  const pruneHistoryCache = useChatStore((s) => s.pruneHistoryCache);
  const setViewportNewest = useChatStore((s) => s.setViewportNewest);
  const rememberPosition = useChatStore((s) => s.rememberPosition);
  const savePosition = useChatStore((s) => s.savePosition);
  const handOffPosition = useChatStore((s) => s.handOffPosition);
  const returnToTail = useChatStore((s) => s.returnToTail);
  const focusMessage = useChatStore((s) => s.focusMessage);
  const openChatAt = useChatStore((s) => s.openChatAt);
  const markRead = useChatStore((s) => s.markRead);
  const setLocalUnread = useChatStore((s) => s.setLocalUnread);
  const unreadAnchor = useChatStore((s) => s.unreadAnchorByChat[chatId]) ?? null;
  const unreadDecided = useChatStore((s) => s.unreadDecidedByChat[chatId]) ?? true;
  const tailRequest = useChatStore((s) => s.tailRequestByChat[chatId]) ?? 0;
  const liveMessage = useChatStore((s) => s.liveMessageByChat[chatId]) ?? 0;
  const readCursors = useChatStore((s) => s.readCursorsByChat[chatId]);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const pinMessage = useChatStore((s) => s.pinMessage);
  const pinnedMessage = useChatStore((s) => s.pinnedByChat[chatId]) ?? null;
  const members = useChatStore((s) => s.membersByChat[chatId]);
  const loadMembers = useChatStore((s) => s.loadMembers);
  const hidePin = useHiddenPinsStore((s) => s.hide);
  const [unpinConfirm, setUnpinConfirm] = useState(false);
  const unreadCount = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.unreadCount ?? 0);
  const mentionCount = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.unreadMentionsCount ?? 0);
  const mentionIds = useChatStore((s) => s.mentionIdsByChat[chatId]);
  const loadUnreadMentions = useChatStore((s) => s.loadUnreadMentions);
  const readMentions = useChatStore((s) => s.readMentions);
  const readAllMentions = useChatStore((s) => s.readAllMentions);
  const pendingMentionReads = useRef(new Set<number>());
  const mentionReadTimer = useRef(0);
  const mentionsRequested = useRef<string | null>(null);
  const mentionLongFired = useRef(false);
  const [mentionMenu, setMentionMenu] = useState<DOMRect | null>(null);
  const mentionJumpRef = useRef<HTMLButtonElement>(null);
  const isService = useChatStore((s) => isServiceChat(s.chats.find((c) => c.id === chatId)));
  const chatBlocked = useChatStore((s) => {
    const chat = s.chats.find((c) => c.id === chatId);
    return chat?.iBlocked === true || chat?.blockedMe === true;
  });
  const myId = useAuthStore((s) => s.user?.id) ?? null;

  // Права на «Удалить чужое»/«Закрепить» в группе завязаны на роль участника (membersByChat) —
  // без явной загрузки они появляются только после того, как пользователь откроет GroupPanel
  // хотя бы раз за сессию (единственное другое место, вызывающее loadMembers).
  useEffect(() => {
    if (isGroup) void loadMembers(chatId);
  }, [chatId, isGroup, loadMembers]);


  const feedKey = `${chatId}#${feedEpoch}`;

  const listRef = useRef<HTMLDivElement>(null);
  const mediaFeed = useMediaFeedScope(listRef);
  const appearSeen = useRef<WeakSet<HTMLElement>>(new WeakSet());
  const liveIds = useRef<Set<number>>(new Set());
  const scrollIdle = useRef(0);
  const stuckToBottom = useRef(true);
  const atVeryBottom = useRef(true);
  const prevScrollHeight = useRef(0);
  const autoScrollUntil = useRef(0);
  const prevLastId = useRef<number | null>(null);
  const wasNewest = useRef(true);
  const settledFeedKey = useRef<string | null>(null);
  const pendingAnchor = useRef<RowAnchor | null>(null);
  const feedAnchor = useRef<{ key: RowKey; top: number } | null>(null);
  const topSpacerRef = useRef<HTMLDivElement>(null);
  const geometry = useRef({ contentTop: 0, padTop: 0 });
  const dayDividerHeight = useRef(DAY_DIVIDER_ESTIMATE);
  const floatingDateIdle = useRef(0);
  const floatingDateRef = useRef<HTMLDivElement>(null);
  const floatingDateOffset = useRef(0);
  const [floatingDate, setFloatingDate] = useState<FloatingDateState | null>(null);
  const floatingDateShown = useRef<FloatingDateState | null>(null);
  floatingDateShown.current = floatingDate;
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const loadingUp = useRef(false);
  const loadingDown = useRef(false);
  const retryUpAt = useRef(0);
  const retryDownAt = useRef(0);
  const prefetchSide = useRef<FeedSide>('older');
  const scrollSample = useRef<{ t: number; top: number } | null>(null);
  const fling = useRef<FlingTakeover | null>(null);
  const keyboardAnchor = useRef(false);
  const bottomGap = useRef(0);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const liveSeen = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashTimer = useRef(0);
  const flashMessageRef = useRef<(messageId: number) => void>(() => undefined);
  const placedFocus = useRef(0);
  const returnTo = useRef<number | null>(null);
  const jumpActive = useRef(false);
  const jumpFrame = useRef(0);
  const scrollToMessageRef = useRef<(messageId: number) => void>(() => undefined);
  const handleQuoteJump = useCallback((fromId: number, toId: number) => {
    returnTo.current = fromId;
    scrollToMessageRef.current(toId);
  }, []);

  if (liveSeen.current !== liveMessage) {
    liveSeen.current = liveMessage;
    if (liveMessage !== 0) liveIds.current.add(liveMessage);
  }

  const myRole = members?.find((m) => m.userId === myId)?.role;
  const isGroupAdmin = isGroup && (myRole === 'OWNER' || myRole === 'ADMIN');
  /** Приватный чат — закреплять может любой участник; группа — только OWNER/ADMIN
   *  (тот же порог, что и на сервере, chat.ts → pinMessage). */
  const canPinBase = !isGroup || isGroupAdmin;

  useEffect(() => {
    scrollSample.current = null;
  }, [feedKey]);

  const rows = useMemo(() => {
    const albums = groupAlbums(messages);
    let cursor = 0;

    return albums.flatMap((album, index) => {
      const firstIndex = cursor;
      cursor += album.length;
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
          firstIndex,
          lastIndex: firstIndex + album.length - 1,
        },
      ];
    });
  }, [messages]);

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
        canReply: !isService && !chatBlocked && row.message.type !== 'ANNOUNCEMENT',
        canReact: !isService,
        isPinned: pinnedMessage !== null && row.groupIds.includes(pinnedMessage.id),
        showUnread: unreadAnchor !== null && row.groupIds.includes(unreadAnchor.messageId),
      };
    });
  }, [rows, myId, readCursors, isGroupAdmin, canPinBase, isService, chatBlocked, pinnedMessage, unreadAnchor]);

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
    const dropped = wasReconciled
      ? previousRows.filter((entry) => !liveKeys.has(entry.key) && !leavingRows.has(entry.key))
      : [];
    const gone = selectDeletedRows(dropped, messages, (entry) => entry.row.groupIds);
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

  const displayEntriesRef = useRef(displayEntries);
  displayEntriesRef.current = displayEntries;

  const startSelectionDrag = useSelectionDrag(listRef, {
    rowAt: (index) => {
      const entry = displayEntriesRef.current[index];
      if (!entry || leavingRows.has(entry.key)) return undefined;
      return { groupIds: entry.row.groupIds, selectable: entry.isReal && !entry.row.message.deletedAt };
    },
    indexOfMessage: (messageId) =>
      displayEntriesRef.current.findIndex((entry) => entry.row.groupIds.includes(messageId)),
    edges: () => {
      const el = listRef.current;
      if (!el) return { top: 0, bottom: 0 };
      const origin = el.getBoundingClientRect().top;
      const edges = visibleEdges(el);
      return { top: origin + edges.top, bottom: origin + edges.bottom };
    },
  });

  const entryIndexByMessage = useMemo(() => {
    const index = new Map<number, number>();
    displayEntries.forEach((entry, position) => {
      for (const id of entry.row.groupIds) index.set(id, position);
    });
    return index;
  }, [displayEntries]);

  const entryIndexByKey = useMemo(() => {
    const index = new Map<RowKey, number>();
    displayEntries.forEach((entry, position) => index.set(entry.key, position));
    return index;
  }, [displayEntries]);

  const measuredHeights = heightsOf(chatId);
  const [heightsVersion, setHeightsVersion] = useState(0);
  const rowKeys = useMemo(() => displayEntries.map((entry) => entry.key), [displayEntries]);
  const table = useMemo(
    () => buildHeightTable(rowKeys, measuredHeights),
    [rowKeys, measuredHeights, heightsVersion],
  );
  const tableRef = useRef(table);
  tableRef.current = table;

  function windowAroundMessage(messageId: number): FeedSlice {
    const index = entryIndexByMessage.get(messageId);
    return index === undefined ? windowAtEnd(table, FEED_SLICE_LIMIT) : windowAround(table, index, FEED_SLICE_LIMIT);
  }

  const [win, setWin] = useState<FeedSlice>(() =>
    focus ? windowAround(table, entryIndexByMessage.get(focus.messageId) ?? table.count, FEED_SLICE_LIMIT) : windowAtEnd(table, FEED_SLICE_LIMIT),
  );
  const winFeedRef = useRef(feedKey);
  const winFocusRef = useRef(focus?.seq ?? 0);
  const winTailRef = useRef(tailRequest);

  let liveWin = win;
  let pinnedByFocus = false;
  if (winFeedRef.current !== feedKey) {
    winFeedRef.current = feedKey;
    winFocusRef.current = focus?.seq ?? 0;
    liveWin = focus ? windowAroundMessage(focus.messageId) : windowAtEnd(table, FEED_SLICE_LIMIT);
    setWin(liveWin);
  } else if (focus && winFocusRef.current !== focus.seq) {
    winFocusRef.current = focus.seq;
    liveWin = windowAroundMessage(focus.messageId);
    setWin(liveWin);
    pinnedByFocus = true;
  }

  if (winTailRef.current !== tailRequest) {
    winTailRef.current = tailRequest;
    liveWin = windowAtEnd(table, FEED_SLICE_LIMIT);
    setWin(liveWin);
  }

  // Запрошенный прыжок держит окно рендера за собой, пока не поставлен: иначе следующий же
  // проход (setWin во время рендера — это второй проход) снова прилипал к хвосту, строка
  // цели не оказывалась в DOM, эффект фокуса выходил ни с чем — и из самого низа ленты
  // переход к дню не срабатывал вовсе (R-33A, найдено пользователем).
  const focusIndex = focus ? entryIndexByMessage.get(focus.messageId) : undefined;
  const focusPending = focus !== null && focus !== undefined && focus.seq !== placedFocus.current && focusIndex !== undefined;
  const stickToTail =
    !pinnedByFocus && !focusPending && settledFeedKey.current === feedKey && stuckToBottom.current && !hasMoreAfter;
  const view: FeedSlice =
    displayEntries.length === 0
      ? { from: 0, to: -1 }
      : stickToTail || liveWin.to < 0 || liveWin.to >= displayEntries.length || liveWin.from > liveWin.to
        ? windowAtEnd(table, FEED_SLICE_LIMIT)
        : liveWin;

  const viewRef = useRef(view);
  viewRef.current = view;

  const firstEntry = displayEntries[view.from];
  const lastEntry = displayEntries[view.to];
  const sliceFrom = firstEntry ? Math.min(firstEntry.row.firstIndex, messages.length) : 0;
  const sliceTo = lastEntry ? Math.min(lastEntry.row.lastIndex, messages.length - 1) : -1;
  const sliceRef = useRef<LocalMessage[]>([]);
  const nextSlice = messages.slice(sliceFrom, sliceTo + 1);
  if (!sameRows(sliceRef.current, nextSlice)) sliceRef.current = nextSlice;
  const slice = sliceRef.current;
  const sliceSignature = `${feedKey}:${slice[0]?.id ?? 0}:${slice[slice.length - 1]?.id ?? 0}:${slice.length}`;
  const geometrySignature = `${sliceSignature}:${heightsVersion}`;
  const isViewportNewest = view.to >= displayEntries.length - 1 && !hasMoreAfter;

  const lastGeometrySignature = useRef(geometrySignature);
  if (lastGeometrySignature.current !== geometrySignature) {
    lastGeometrySignature.current = geometrySignature;
    const el = listRef.current;
    if (el && settledFeedKey.current === feedKey && pendingAnchor.current === null && !stuckToBottom.current) {
      pendingAnchor.current = rememberAnchor(el);
    }
  }

  const skeletonTop = skeletonsAbove(view);
  const skeletonBottom = skeletonsBelow(table, view);
  const spacerTopHeight = rowTop(table, skeletonTop.from);
  const spacerBottomHeight = Math.max(0, totalHeight(table) - rowTop(table, skeletonBottom.to + 1));

  /** Скроллим сам контейнер, а не через scrollIntoView: тот тянет за собой все скроллящиеся
   *  предки, и однажды уже утащил вниз всю оболочку вместе с плавающей хромой. */
  function scrollToBottom(smooth: boolean): void {
    const el = listRef.current;
    if (!el) return;
    fling.current?.stop();
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const behavior: ScrollBehavior = smooth && distance <= el.clientHeight * SCROLL_ANIMATE_SCREENS ? 'smooth' : 'auto';
    autoScrollUntil.current = performance.now() + AUTO_SCROLL_GUARD_MS;
    stuckToBottom.current = true;
    atVeryBottom.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
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

  function flashMessage(messageId: number): void {
    window.clearTimeout(flashTimer.current);
    setFlashId(messageId);
    flashTimer.current = window.setTimeout(() => setFlashId(null), cssDurationMs('--dur-flash'));
  }

  flashMessageRef.current = flashMessage;

  const openCalendarAt = useCallback((iso: string) => setCalendarDay(dayKeyOfIso(iso)), []);

  function jumpToDayStart(iso: string): void {
    const key = dayKeyOfIso(iso);
    const entries = displayEntriesRef.current;
    const index = entries.findIndex((item) => dayKeyOfIso(item.row.message.createdAt) === key);
    const known = index > 0 || (index === 0 && !hasMore);
    if (known) {
      void focusMessageInChat(chatId, entries[index]!.row.message.id);
      return;
    }
    chatCalendarRequest(chatId, { from: key, to: key }, 'all')
      .then((calendar) => {
        const day = calendar.days[0];
        if (day) void focusMessageInChat(chatId, day.firstMessageId);
      })
      .catch(() => undefined);
  }

  function pickCalendarDay(firstMessageId: number): void {
    setCalendarDay(null);
    void focusMessageInChat(chatId, firstMessageId);
  }

  scrollToMessageRef.current = (messageId) => scrollToMessage(messageId);

  function scrollToMessage(messageId: number): void {
    const el = listRef.current;
    const target = el?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`) ?? null;
    if (!el || !target) {
      if (entryIndexByMessage.has(messageId)) focusMessage(chatId, messageId);
      else void openChatAt(chatId, messageId);
      return;
    }

    fling.current?.stop();
    autoScrollUntil.current = 0;
    stuckToBottom.current = false;
    atVeryBottom.current = false;
    flashMessage(messageId);
    runJump(el, messageId);
  }

  function runJump(el: HTMLDivElement, messageId: number): void {
    cancelAnimationFrame(jumpFrame.current);
    jumpActive.current = true;
    const instant = cssDurationMs('--dur-menu') <= 1;
    const started = performance.now();
    let last = started;
    let arrivedAt = instant ? started : 0;
    let missingSince = 0;

    function desiredTop(node: HTMLElement): number {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const top = node.offsetTop + node.offsetHeight / 2 - visibleCenter(el);
      return Math.min(max, Math.max(0, top));
    }

    function step(now: number): void {
      if (!jumpActive.current) return;
      const node = el.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
      if (!node) {
        if (missingSince === 0) missingSince = now;
        if (now - missingSince >= JUMP_MISSING_MS) finishJump();
        else jumpFrame.current = requestAnimationFrame(step);
        return;
      }
      missingSince = 0;
      const desired = desiredTop(node);
      const delta = desired - el.scrollTop;
      if (arrivedAt === 0) {
        const dt = Math.max(1, now - last);
        const share = 1 - Math.exp(-dt / JUMP_EASE_MS);
        const move = Math.abs(delta) <= 1 || now - started >= JUMP_TRAVEL_MS ? delta : delta * share;
        el.scrollTop += move;
        if (Math.abs(desired - el.scrollTop) <= 1) arrivedAt = now;
      } else if (Math.abs(delta) > 1) {
        el.scrollTop = desired;
      }
      last = now;
      if (arrivedAt !== 0 && now - arrivedAt >= JUMP_HOLD_MS) {
        finishJump();
        return;
      }
      jumpFrame.current = requestAnimationFrame(step);
    }

    if (instant) {
      const node = el.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
      if (node) el.scrollTop = desiredTop(node);
    }
    jumpFrame.current = requestAnimationFrame(step);
  }

  function finishJump(): void {
    cancelAnimationFrame(jumpFrame.current);
    jumpFrame.current = 0;
    if (!jumpActive.current) return;
    jumpActive.current = false;
    checkEdgesRef.current();
  }

  function jumping(): boolean {
    return jumpActive.current;
  }

  function releaseJump(): void {
    finishJump();
  }

  useLayoutEffect(() => {
    if (settledFeedKey.current === feedKey || messages.length === 0) return;
    settledFeedKey.current = feedKey;
    prevLastId.current = messages[messages.length - 1]?.id ?? null;
    retryUpAt.current = 0;
    retryDownAt.current = 0;
    if (focus && listRef.current?.querySelector(`[data-message-id="${focus.messageId}"]`)) {
      autoScrollUntil.current = 0;
      stuckToBottom.current = false;
      atVeryBottom.current = false;
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

    // Прыжок отменяет прилипание к низу до всякой проверки: даже если строка ещё не в DOM,
    // эффект «держать хвост» ниже не должен утягивать ленту обратно.
    autoScrollUntil.current = 0;
    stuckToBottom.current = false;
    atVeryBottom.current = false;

    const target = rowNodeFor(el, focus.messageId);
    if (!target) return;
    placedFocus.current = focus.seq;
    fling.current?.stop();
    const quiet = focus.quiet === true;
    const unread = focus.unread === true;
    const offset = focus.offset ?? 0;
    if (quiet) pendingAnchor.current = null;
    function place(): void {
      if (unread) {
        const divider = el!.querySelector<HTMLElement>('[data-unread-divider]') ?? target!;
        el!.scrollTop = Math.max(0, divider.offsetTop + divider.offsetHeight / 2 - visibleCenter(el!));
        return;
      }
      if (!quiet) {
        el!.scrollTop = Math.max(0, target!.offsetTop - el!.clientHeight / 3);
        return;
      }
      const node = el!.querySelector<HTMLElement>(`[data-message-id="${focus!.messageId}"]`);
      if (!node || el!.clientHeight === 0) return;
      el!.scrollTop = Math.max(0, node.offsetTop - offset);
    }
    place();
    if (!quiet) flashMessageRef.current(focus.messageId);

    const observer = new ResizeObserver(place);
    for (const node of el.querySelectorAll<HTMLElement>('.message-wrap')) observer.observe(node);
    if (topSpacerRef.current) observer.observe(topSpacerRef.current);

    function release(): void {
      observer.disconnect();
      el!.removeEventListener('pointerdown', release);
      el!.removeEventListener('wheel', release);
      el!.removeEventListener('touchstart', release);
    }
    el.addEventListener('pointerdown', release);
    el.addEventListener('wheel', release, { passive: true });
    el.addEventListener('touchstart', release, { passive: true });
    const holdTimer = window.setTimeout(release, quiet ? RESTORE_HOLD_MS : FOCUS_HOLD_MS);

    return () => {
      window.clearTimeout(holdTimer);
      release();
    };
  }, [focus]);

  useLayoutEffect(() => {
    const lastMessage = messages[messages.length - 1] ?? null;
    const lastId = lastMessage?.id ?? null;
    if (settledFeedKey.current !== feedKey) {
      prevLastId.current = lastId;
      wasNewest.current = isViewportNewest;
      return;
    }
    const el = listRef.current;
    if (
      el &&
      shouldFollowTail({
        lastId,
        prevLastId: prevLastId.current,
        liveMessageId: liveMessage,
        isOwnLast: lastMessage !== null && lastMessage.sender?.id === myId,
        wasNewest: wasNewest.current,
        isAutoScrolling: performance.now() < autoScrollUntil.current,
        scrollHeight: el.scrollHeight,
        prevScrollHeight: prevScrollHeight.current,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
        bottomReserve: 0,
        stickThreshold: FOLLOW_THRESHOLD,
      })
    ) {
      setShowJump(false);
      scrollToBottom(true);
    } else if (
      el &&
      lastId !== prevLastId.current &&
      isTailArrival(lastId, liveMessage) &&
      el.scrollHeight - el.scrollTop - el.clientHeight > FOLLOW_THRESHOLD
    ) {
      setShowJump(true);
    }
    prevLastId.current = lastId;
    wasNewest.current = isViewportNewest;
  }, [feedKey, messages, isViewportNewest, myId, liveMessage]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) prevScrollHeight.current = el.scrollHeight;
  });

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const held = feedAnchor.current;
    const heldIndex = held === null ? undefined : entryIndexByKey.get(held.key);
    if (atVeryBottom.current) {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance > 1 && performance.now() >= autoScrollUntil.current) el.scrollTop = el.scrollHeight;
    } else if (held !== null && heldIndex !== undefined) {
      const shift = rowTop(table, heldIndex) - held.top;
      if (Math.abs(shift) > 0.5 && performance.now() >= autoScrollUntil.current) el.scrollTop += shift;
    }
    const first = displayEntries[view.from];
    feedAnchor.current = first ? { key: first.key, top: rowTop(table, view.from) } : null;

    const anchor = pendingAnchor.current;
    if (!anchor) return;
    pendingAnchor.current = null;
    if (performance.now() >= autoScrollUntil.current) {
      restoreAnchor(el, anchor);
      const raw = el.scrollHeight - el.scrollTop - el.clientHeight;
      stuckToBottom.current = raw - bottomReserve(el) < STICK_THRESHOLD;
      atVeryBottom.current = raw <= BOTTOM_SNAP;
    }
    if (loadingUp.current || loadingDown.current) pendingAnchor.current = rememberAnchor(el);
  }, [geometrySignature, displayEntries, entryIndexByKey, table, view.from]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const spacer = topSpacerRef.current;
    if (spacer) geometry.current.contentTop = spacer.offsetTop;

    const divider = el.querySelector<HTMLElement>('[data-day-divider]');
    if (divider && divider.offsetHeight > 0) dayDividerHeight.current = divider.offsetHeight;

    let changed = false;
    for (const node of el.querySelectorAll<HTMLElement>('[data-row-index]')) {
      const entry = displayEntriesRef.current[Number(node.dataset.rowIndex)];
      if (!entry) continue;
      const height = node.offsetHeight;
      if (height <= 0 || measuredHeights.get(entry.key) === height) continue;
      measuredHeights.set(entry.key, height);
      changed = true;
    }

    if (changed) {
      if (!stuckToBottom.current && pendingAnchor.current === null) pendingAnchor.current = rememberAnchor(el);
      setHeightsVersion((version) => version + 1);
      return;
    }
    syncWindow();
  });

  const insetChatRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    const delta = padTop - geometry.current.padTop;
    geometry.current.padTop = padTop;
    const sameChat = insetChatRef.current === chatId;
    insetChatRef.current = chatId;
    if (sameChat && delta !== 0) el.scrollTop += delta;
  }, [chatId, topInsetKey]);

  useEffect(() => {
    if (TYPING_BUBBLE_IN_FEED && typing && stuckToBottom.current) scrollToBottom(true);
  }, [typing]);

  useLayoutEffect(() => {
    if (tailRequest === 0) return;
    pendingAnchor.current = null;
    stuckToBottom.current = true;
    setShowJump(false);
    scrollToBottom(false);
  }, [tailRequest]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const seen = appearSeen.current;
    const live = liveIds.current;
    liveIds.current = new Set();
    for (const node of el.querySelectorAll<HTMLElement>('.message-wrap')) {
      if (seen.has(node)) continue;
      seen.add(node);
      if (live.has(Number(node.dataset.messageId))) node.dataset.appear = '1';
    }
  });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!atVeryBottom.current) return;
      // Пока едет клавиатура, прокрутку правит onKeyboardHeight — синхронно и тем же
      // числом. Второй проход здесь только заставил бы пересчитать раскладку ещё раз.
      if (document.documentElement.dataset.bottomLift !== undefined) return;
      fling.current?.stop();
      el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [chatId]);

  // Раскладка под клавиатуру меняется один раз за движение, а картинку всё движение ведёт
  // преобразование: за кадр не выполняется ни строчки скрипта, движение проигрывает
  // композитор по кривой самой клавиатуры.
  useEffect(() => {
    const list = listRef.current;
    const jump = jumpRef.current;
    const mentionJump = mentionJumpRef.current;
    const off = [
      list ? registerInsetMover(list, 'feed') : null,
      jump ? registerInsetMover(jump, 'chrome') : null,
      mentionJump ? registerInsetMover(mentionJump, 'chrome') : null,
    ];
    return () => off.forEach((stop) => stop?.());
  }, [chatId]);

  useEffect(
    () =>
      onBottomInset(({ phase, layoutShift }) => {
        const el = listRef.current;
        if (!el) return;

        if (phase === 'measure') {
          bottomGap.current = el.scrollHeight - el.scrollTop - el.clientHeight;
          return;
        }
        if (phase === 'start') keyboardAnchor.current = true;
        if (phase === 'end') keyboardAnchor.current = false;
        if (layoutShift === 0) return;

        fling.current?.stop();
        el.scrollTop = el.scrollHeight - el.clientHeight - bottomGap.current;
      }),
    [],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const takeover = attachFlingTakeover(el, (beltVelocity) => {
      if (beltVelocity === 0) return;
      const rows = predictedPrefetchRows(beltVelocity, tableRef.current.average);
      const side: FeedSide = beltVelocity > 0 ? 'newer' : 'older';
      prefetchFeed(chatId, side, Math.max(rows, FEED_PREFETCH_MARGIN));
    });
    fling.current = takeover;
    return () => {
      fling.current = null;
      takeover.destroy();
    };
  }, [chatId, prefetchFeed]);

  function requestUp(): void {
    const el = listRef.current;
    if (!el || !hasMore || loadingUp.current || performance.now() < retryUpAt.current || jumping()) return;
    loadingUp.current = true;
    pendingAnchor.current = rememberAnchor(el);
    loadMore(chatId)
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
    if (!el || !hasMoreAfter || loadingDown.current || performance.now() < retryDownAt.current || jumping()) return;
    loadingDown.current = true;
    pendingAnchor.current = rememberAnchor(el);
    loadMoreAfter(chatId)
      .catch(() => {
        pendingAnchor.current = null;
        retryDownAt.current = performance.now() + FEED_RETRY_MS;
      })
      .finally(() => {
        loadingDown.current = false;
      });
  }

  function syncWindow(): void {
    const el = listRef.current;
    if (!el || tableRef.current.count === 0) return;
    const height = el.clientHeight;
    if (height === 0) return;
    const next = windowAtOffset(
      tableRef.current,
      el.scrollTop - geometry.current.contentTop,
      height,
      FEED_SLICE_LIMIT,
    );
    setWin((current) => (sameWindow(current, next) ? current : next));
  }

  function checkEdges(): void {
    const el = listRef.current;
    if (!el) return;
    const ahead = Math.max(FEED_SENSITIVE_AREA_PX, el.clientHeight);
    const above = el.scrollTop - geometry.current.contentTop;
    const below = totalHeight(tableRef.current) - above - el.clientHeight;
    if (above < ahead) {
      prefetchSide.current = 'older';
      requestUp();
    }
    if (below < ahead) {
      prefetchSide.current = 'newer';
      requestDown();
    }
  }

  const checkEdgesRef = useRef(checkEdges);
  checkEdgesRef.current = checkEdges;

  useEffect(() => () => window.clearTimeout(scrollIdle.current), [chatId]);

  const capturePosition = useRef<() => void>(() => undefined);
  capturePosition.current = () => {
    if (messages.length === 0) return;
    const el = listRef.current;
    const anchor = el ? rememberAnchor(el) : null;
    const anchorId = anchor && Number(anchor.id) > 0 ? Number(anchor.id) : null;
    if (!el || anchor === null || anchorId === null) return;
    rememberPosition(chatId, {
      fromId: view.from <= 0 ? null : (slice[0]?.id ?? null),
      toId: view.to >= displayEntries.length - 1 ? null : (slice[slice.length - 1]?.id ?? null),
      anchorId,
      anchorOffset: anchor.top - el.getBoundingClientRect().top,
      atTail: isViewportNewest && stuckToBottom.current,
    });
  };

  useEffect(() => {
    capturePosition.current();
  }, [geometrySignature]);

  useEffect(() => {
    function onVisibilityChange(): void {
      if (document.visibilityState !== 'hidden') return;
      capturePosition.current();
      savePosition(chatId);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      handOffPosition(chatId);
    };
  }, [chatId, savePosition, handOffPosition]);

  useEffect(() => {
    setViewportNewest(chatId, isViewportNewest);
  }, [chatId, isViewportNewest, setViewportNewest]);

  useEffect(() => () => setViewportNewest(chatId, null), [chatId, setViewportNewest]);

  // Свёрнутое окно никто не читает. Раньше открытый чат отмечал прочитанным всё, что
  // придёт, даже когда приложение в трее: уведомление на этом компьютере тут же гасло, а
  // вместе с ним — уведомления на телефоне (они снимаются по прочтению, R-38).
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const sync = (): void => setDocumentVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const readTracker = useMemo(
    () =>
      new ReadTracker((messageId) => markRead(chatId, messageId), {
        now: () => performance.now(),
        setTimeout: (callback, ms) => window.setTimeout(callback, ms),
        clearTimeout: (handle) => window.clearTimeout(handle),
      }),
    [chatId, markRead],
  );
  useEffect(() => () => readTracker.flush(), [readTracker]);
  useEffect(() => {
    if (!documentVisible) readTracker.flush();
  }, [documentVisible, readTracker]);

  const myCursor = myId ? readCursors?.[myId] : undefined;
  useEffect(() => {
    readTracker.know(myCursor);
  }, [myCursor, readTracker]);

  const readFrame = useRef(0);
  const updateReadingRef = useRef<() => void>(() => undefined);
  function flushMentionReads(): void {
    window.clearTimeout(mentionReadTimer.current);
    mentionReadTimer.current = 0;
    const ids = [...pendingMentionReads.current];
    pendingMentionReads.current.clear();
    if (ids.length > 0) readMentions(chatId, ids);
  }

  function collectMentionReads(el: HTMLElement): void {
    if (!mentionIds || mentionIds.length === 0) return;
    const wanted = new Set(mentionIds);
    const listTop = el.getBoundingClientRect().top;
    const edges = visibleEdges(el);
    const top = listTop + edges.top;
    const bottom = listTop + edges.bottom;
    let flashed = 0;
    for (const node of el.querySelectorAll<HTMLElement>('.message-wrap')) {
      const id = Number(node.dataset.messageId);
      if (!wanted.has(id) || pendingMentionReads.current.has(id)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= top || rect.top >= bottom) continue;
      pendingMentionReads.current.add(id);
      flashed = id;
    }
    if (flashed !== 0) flashMessageRef.current(flashed);
    if (pendingMentionReads.current.size > 0 && mentionReadTimer.current === 0) {
      mentionReadTimer.current = window.setTimeout(flushMentionReads, MENTION_READ_INTERVAL_MS);
    }
  }

  updateReadingRef.current = () => {
    const el = listRef.current;
    if (el && documentVisible && !(focus && focus.seq !== placedFocus.current)) collectMentionReads(el);
    if (!el || !documentVisible || !unreadDecided) return;
    if (unreadCount > 0 && myCursor === undefined) return;
    if (focus && focus.seq !== placedFocus.current && entryIndexByMessage.has(focus.messageId)) return;
    const listTop = el.getBoundingClientRect().top;
    const edges = visibleEdges(el);
    const top = listTop + edges.top;
    const bottom = listTop + edges.bottom;
    let newest = 0;
    for (const node of el.querySelectorAll<HTMLElement>('.message-wrap')) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= top || rect.top >= bottom) continue;
      const index = entryIndexByMessage.get(Number(node.dataset.messageId));
      const entry = index === undefined ? undefined : displayEntries[index];
      if (!entry || entry.own || !entry.isReal) continue;
      newest = Math.max(newest, entry.row.lastId);
    }
    if (newest <= 0) return;
    const before = readTracker.cursor;
    if (!readTracker.seen(newest)) return;
    const read = unreadBetween(messages, myId, before, newest);
    if (read > 0) setLocalUnread(chatId, unreadCount - read);
  };

  function scheduleReading(): void {
    if (readFrame.current !== 0) return;
    readFrame.current = requestAnimationFrame(() => {
      readFrame.current = 0;
      updateReadingRef.current();
    });
  }

  useEffect(
    () => () => {
      cancelAnimationFrame(readFrame.current);
      readFrame.current = 0;
    },
    [],
  );

  useEffect(() => {
    if (!isGroup || mentionCount <= 0 || mentionsRequested.current === chatId) return;
    mentionsRequested.current = chatId;
    loadUnreadMentions(chatId).catch(() => {
      mentionsRequested.current = null;
    });
  }, [isGroup, mentionCount, chatId, loadUnreadMentions]);

  const flushMentionReadsRef = useRef(flushMentionReads);
  flushMentionReadsRef.current = flushMentionReads;
  useEffect(() => () => flushMentionReadsRef.current(), [chatId]);

  const mentionPress = useLongPress({
    onLongPress: () => {
      mentionLongFired.current = true;
      const rect = mentionJumpRef.current?.getBoundingClientRect();
      if (rect) setMentionMenu(rect);
    },
  });

  function handleMentionJump(): void {
    if (mentionLongFired.current) {
      mentionLongFired.current = false;
      return;
    }
    const first = (useChatStore.getState().mentionIdsByChat[chatId] ?? []).find((id) => !pendingMentionReads.current.has(id));
    if (first !== undefined) {
      void focusMessageInChat(chatId, first);
      return;
    }
    loadUnreadMentions(chatId)
      .then((ids) => {
        if (ids[0] !== undefined) void focusMessageInChat(chatId, ids[0]);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    scheduleReading();
  });

  useEffect(() => {
    if (jumping()) return;
    const side = prefetchSide.current;
    const unseen = side === 'older' ? sliceFrom : messages.length - 1 - sliceTo;
    prefetchFeed(chatId, side, FEED_PREFETCH_MARGIN - unseen);
  }, [chatId, messages, sliceFrom, sliceTo, prefetchFeed]);

  useEffect(
    () => () => {
      cancelAnimationFrame(jumpFrame.current);
      jumpFrame.current = 0;
      jumpActive.current = false;
    },
    [],
  );

  useEffect(() => {
    checkEdgesRef.current();
  }, [geometrySignature, hasMore, hasMoreAfter]);

  function moveFloatingDate(offset: number): void {
    if (floatingDateOffset.current === offset) return;
    floatingDateOffset.current = offset;
    const node = floatingDateRef.current;
    if (node) node.style.transform = `translateY(${offset}px)`;
  }

  function updateFloatingDate(): void {
    const el = listRef.current;
    const entries = displayEntriesRef.current;
    const heights = tableRef.current;
    if (!el || entries.length === 0 || heights.count === 0) {
      setFloatingDate(null);
      return;
    }

    const clip = el.scrollTop + geometry.current.padTop - geometry.current.contentTop;
    const stuck = stickyDate(
      heights,
      (index) => entries[index]?.row.showDay === true,
      clip,
      dayDividerHeight.current,
    );
    const entry = stuck === null ? undefined : entries[stuck.dayIndex];
    if (!stuck || !entry) {
      setFloatingDate(null);
      return;
    }

    const iso = entry.row.message.createdAt;
    const shown = floatingDateShown.current;
    if (shown === null || !isSameDay(shown.iso, iso)) {
      const next = { iso, hidden: false, instant: true };
      floatingDateShown.current = next;
      flushSync(() => setFloatingDate(next));
    } else if (shown.hidden) {
      setFloatingDate({ iso: shown.iso, hidden: false, instant: false });
    }
    moveFloatingDate(stuck.offset);
    window.clearTimeout(floatingDateIdle.current);
    floatingDateIdle.current = window.setTimeout(
      () =>
        setFloatingDate((current) =>
          current === null || current.hidden ? current : { ...current, hidden: true, instant: false },
        ),
      FLOATING_DATE_HIDE_MS,
    );
  }

  useEffect(() => {
    setFloatingDate(null);
    floatingDateOffset.current = 0;
    const node = floatingDateRef.current;
    if (node) node.style.transform = 'translateY(0px)';
    return () => window.clearTimeout(floatingDateIdle.current);
  }, [chatId]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), [chatId]);

  function handleScroll(): void {
    const el = listRef.current;
    if (!el) return;
    // Пока едет клавиатура, прокрутку ведём мы сами и уводим её от конца намеренно —
    // иначе лента решит, что человек ушёл вверх, и перестанет держаться низа.
    if (keyboardAnchor.current) return;
    // Скролл отменяет любой висящий жест сообщения — long-press/окно двойного тапа
    // (ux-ui/gestures.md, «Общие правила», п.2; см. ui/gestures/gestureReducer.ts).
    bumpScrollEpoch();
    const raw = el.scrollHeight - el.scrollTop - el.clientHeight;
    const distance = raw - bottomReserve(el);
    prevScrollHeight.current = el.scrollHeight;
    atVeryBottom.current = raw <= BOTTOM_SNAP;
    if (performance.now() < autoScrollUntil.current) {
      if (raw <= 1) autoScrollUntil.current = 0;
      stuckToBottom.current = true;
      atVeryBottom.current = true;
    } else {
      stuckToBottom.current = distance < STICK_THRESHOLD;
      if (distance > el.clientHeight * JUMP_AFTER_SCREENS) setShowJump(true);
      else if (distance < STICK_THRESHOLD) {
        setShowJump(false);
        if (isViewportNewest) returnTo.current = null;
      }
    }

    syncWindow();
    checkEdges();
    updateFloatingDate();
    scheduleReading();

    const now = performance.now();
    const sample = scrollSample.current;
    scrollSample.current = { t: now, top: el.scrollTop };
    const dt = sample ? now - sample.t : 0;
    if (sample && dt > 0 && !jumping()) {
      const instVelocity = ((el.scrollTop - sample.top) / dt) * 1000;
      if (instVelocity !== 0) {
        const rows = predictedPrefetchRows(instVelocity, table.average);
        const side: FeedSide = instVelocity > 0 ? 'newer' : 'older';
        prefetchFeed(chatId, side, Math.max(rows, FEED_PREFETCH_MARGIN));
      }
    }

    window.clearTimeout(scrollIdle.current);
    scrollIdle.current = window.setTimeout(() => {
      capturePosition.current();
      trimFeed(chatId, prefetchSide.current, keepRange(sliceRef.current));
      pruneHistoryCache();
    }, SCROLL_IDLE_MS);
  }

  function handleJump(): void {
    const back = returnTo.current;
    if (back !== null) {
      returnTo.current = null;
      scrollToMessage(back);
      return;
    }
    if (isViewportNewest) {
      scrollToBottom(true);
      return;
    }
    void returnToTail(chatId);
  }


  function handlePinnedClose(): void {
    if (!pinnedMessage) return;
    if (canPinBase) setUnpinConfirm(true);
    else hidePin(chatId, pinnedMessage.id);
  }

  return (
    <MediaFeedContext.Provider value={mediaFeed}>
      <SelectionDragContext.Provider value={startSelectionDrag}>
      {pinnedMessage &&
        pinnedVisible &&
        pinnedSlot &&
        createPortal(
          <PinnedBanner
            message={pinnedMessage}
            canUnpin={canPinBase}
            onJump={() => scrollToMessage(pinnedMessage.id)}
            onClose={handlePinnedClose}
          />,
          pinnedSlot,
        )}

      {unpinConfirm && (
        <UnpinMessageModal
          onCancel={() => setUnpinConfirm(false)}
          onConfirm={() => {
            setUnpinConfirm(false);
            pinMessage(chatId, null);
          }}
        />
      )}

      <div
        className={`${styles.list} hide-native-scrollbar`}
        ref={listRef}
        data-message-scroller="true"
        onScroll={handleScroll}
        onWheel={() => {
          autoScrollUntil.current = 0;
          releaseJump();
        }}
        onTouchMove={() => {
          autoScrollUntil.current = 0;
          releaseJump();
        }}
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

        {displayEntries.length === 0 && !hasMore && historyState === 'ready' && (
          <p className={styles.empty}>Сообщений пока нет. Напишите первым.</p>
        )}

        {displayEntries.length === 0 && historyState === 'offline' && (
          <p className={styles.empty}>Нет связи. История не загружена.</p>
        )}

        <div className={styles.spacer} style={{ height: spacerTopHeight }} ref={topSpacerRef} aria-hidden="true" />

        {displayEntries.slice(skeletonTop.from, skeletonTop.to + 1).map((entry, offset) => (
          <RowShape key={`shape-${entry.key}`} own={entry.own} height={rowHeight(table, skeletonTop.from + offset)} />
        ))}

        {displayEntries.slice(view.from, view.to + 1).map((entry, offset) => (
          <MessageListRow
            key={entry.key}
            index={view.from + offset}
            entry={entry}
            leaving={leavingRows.has(entry.key)}
            chatId={chatId}
            myId={myId}
            isGroup={isGroup}
            unreadCount={unreadAnchor?.count ?? 0}
            onReply={onReply}
            onQuoteJump={handleQuoteJump}
            onEdit={onEdit}
            onForwardRequest={onForwardRequest}
            onToggleReaction={toggleReaction}
            onLeaveDone={handleLeaveDone}
            flash={flashId !== null && entry.row.groupIds.includes(flashId)}
            dayCovered={
              floatingDate !== null &&
              entry.row.showDay &&
              isSameDayOrBefore(entry.row.message.createdAt, floatingDate.iso)
            }
            listRef={listRef}
            atBottomRef={atVeryBottom}
            onOpenCalendar={openCalendarAt}
          />
        ))}

        {displayEntries.slice(skeletonBottom.from, skeletonBottom.to + 1).map((entry, offset) => (
          <RowShape
            key={`shape-${entry.key}`}
            own={entry.own}
            height={rowHeight(table, skeletonBottom.from + offset)}
          />
        ))}

        <div className={styles.spacer} style={{ height: spacerBottomHeight }} aria-hidden="true" />

        {TYPING_BUBBLE_IN_FEED && typing && (
          <div className={styles.typingRow}>
            <div className={styles.typingBubble}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}

      </div>

      <FloatingDate
        ref={floatingDateRef}
        iso={floatingDate?.iso ?? null}
        hidden={floatingDate?.hidden ?? true}
        instant={floatingDate?.instant ?? true}
        onJumpToDay={jumpToDayStart}
      />

      {calendarDay && (
        <ChatCalendar
          chatId={chatId}
          filter="all"
          anchorDate={calendarDay}
          selected={calendarDay}
          onPick={(day) => pickCalendarDay(day.firstMessageId)}
          onClose={() => setCalendarDay(null)}
        />
      )}

      <button
        type="button"
        ref={jumpRef}
        className={`${styles.jump} ${(showJump || !isViewportNewest) && !searchArrowsShown ? '' : styles.jumpHidden}`}
        aria-label="К последним сообщениям"
        tabIndex={(showJump || !isViewportNewest) && !searchArrowsShown ? 0 : -1}
        onClick={handleJump}
      >
        <Icon name="chevron-down" size={22} />
        <Badge count={unreadCount} small className={styles.jumpBadge} />
      </button>

      <button
        type="button"
        ref={mentionJumpRef}
        className={`${styles.jump} ${styles.mentionJump} ${mentionCount > 0 && !searchArrowsShown ? '' : styles.jumpHidden}`}
        style={{
          ['--mention-lift' as string]:
            (showJump || !isViewportNewest) && !searchArrowsShown ? `${unreadCount > 0 ? 64 : 54}px` : '0px',
        }}
        aria-label={`К непрочитанным упоминаниям: ${mentionCount}`}
        tabIndex={mentionCount > 0 && !searchArrowsShown ? 0 : -1}
        onClick={handleMentionJump}
        onPointerDown={mentionPress.onPointerDown}
        onPointerMove={mentionPress.onPointerMove}
        onPointerUp={mentionPress.onPointerUp}
        onPointerCancel={mentionPress.onPointerCancel}
        onContextMenu={(event) => {
          event.preventDefault();
          setMentionMenu(event.currentTarget.getBoundingClientRect());
        }}
      >
        <Icon name="at" size={22} />
        <Badge count={mentionCount} small className={styles.jumpBadge} />
      </button>

      {mentionMenu && (
        <Menu
          anchor={mentionMenu}
          onClose={() => setMentionMenu(null)}
          items={[
            {
              id: 'read-all-mentions',
              label: 'Отметить все прочитанными',
              icon: 'check-double',
              onSelect: () => {
                pendingMentionReads.current.clear();
                readAllMentions(chatId);
              },
            },
          ]}
        />
      )}
      </SelectionDragContext.Provider>
    </MediaFeedContext.Provider>
  );
}

/** Строка сообщения — буквально `justify-content:{{m.align}}` из референса (строка 331):
 *  пузырь встаёт у своего края. Этап 6 достроил вокруг неё разведение жестов из
 *  gestures.md (тап/двойной тап/long-press/свайп-ответ), контекстное меню и мультивыбор.
 *  Обёртка `.shell` есть всегда, а не появляется на время ухода: смена формы дерева
 *  пересоздала бы узел строки со всеми последствиями (см. `leavingRows` выше). */
const MessageListRow = memo(function MessageListRow({
  entry,
  index,
  leaving,
  chatId,
  myId,
  isGroup,
  unreadCount,
  onReply,
  onEdit,
  onForwardRequest,
  onToggleReaction,
  onQuoteJump,
  onLeaveDone,
  flash,
  dayCovered,
  listRef,
  atBottomRef,
  onOpenCalendar,
}: {
  entry: RenderRow;
  index: number;
  leaving: boolean;
  chatId: string;
  myId: string | null;
  isGroup: boolean;
  unreadCount: number;
  onReply: (message: LocalMessage) => void;
  onEdit: (message: LocalMessage) => void;
  onForwardRequest: (messageIds: number[]) => void;
  onToggleReaction: (chatId: string, messageId: number, emoji: string) => void;
  onQuoteJump: (fromId: number, toId: number) => void;
  onLeaveDone: (key: RowKey) => void;
  flash: boolean;
  dayCovered: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  atBottomRef: React.RefObject<boolean>;
  onOpenCalendar: (iso: string) => void;
}) {
  const { row, own, read, isReal, canEdit, canDelete, canPin, canReply, canReact, isPinned, showUnread } = entry;
  const { message, groupIds, album, reactions, sameAuthorAsPrev, sameAuthorAsNext } = row;

  const shellRef = useRef<HTMLDivElement>(null);
  const [collapsing, setCollapsing] = useState(false);
  const replyTarget = message.replyTo && !message.replyTo.deletedAt && isReal ? message.replyTo.id : null;
  const quoteJump = useMemo(
    () => (replyTarget === null ? undefined : () => onQuoteJump(message.id, replyTarget)),
    [replyTarget, message.id, onQuoteJump],
  );

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
    if (list && !atBottomRef.current && node.offsetTop < list.scrollTop) {
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
  }, [leaving, entry.key, onLeaveDone, listRef, atBottomRef]);

  useLayoutEffect(() => {
    if (!collapsing) return;
    const node = shellRef.current;
    if (node) node.style.height = '0px';
  }, [collapsing]);

  return (
    <div className={`${styles.row} ${collapsing ? styles.rowCollapsing : ''}`} data-row-index={index}>
      {row.showDay && (
        <DateDivider iso={message.createdAt} covered={dayCovered} onOpenCalendar={onOpenCalendar} />
      )}
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
          flash={flash}
          onReply={onReply}
          onEdit={onEdit}
          onForwardRequest={onForwardRequest}
          onQuoteJump={quoteJump}
        >
          <MessageBubble
            message={message}
            own={own}
            read={read}
            onQuoteJump={quoteJump}
            showAuthor={isGroup && !own && !sameAuthorAsPrev}
            album={album ?? undefined}
            hasReactions={isReal && reactions.length > 0}
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
    </div>
  );
});

const RowShape = memo(function RowShape({ own, height }: { own: boolean; height: number }) {
  return (
    <div className={`${styles.shape} ${own ? styles.shapeOwn : ''}`} style={{ height }} aria-hidden="true">
      <span className={styles.shapeBubble} />
    </div>
  );
});
