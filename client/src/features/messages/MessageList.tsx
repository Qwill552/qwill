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
  const reconciled = useChatStore((s) => s.hasMoreByChat[chatId] !== undefined);
  const historyState = useChatStore((s) => s.historyByChat[chatId]) ?? 'loading';
  const loadMore = useChatStore((s) => s.loadMore);
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

  const listRef = useRef<HTMLDivElement>(null);
  const stuckToBottom = useRef(true);
  const prevLength = useRef(0);
  const settledChatId = useRef<string | null>(null);
  /** Высота содержимого до догрузки истории — по ней восстанавливается позиция. */
  const prependAnchor = useRef<number | null>(null);
  const [showJump, setShowJump] = useState(false);

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
  }, [chatId]);

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
  function scrollToMessage(messageId: number): void {
    const el = listRef.current;
    const target = el?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!el || !target) return;
    const top = target.offsetTop - el.clientHeight / 2 + target.clientHeight / 2;
    el.scrollTo({ top, behavior: 'smooth' });
  }

  useLayoutEffect(() => {
    if (settledChatId.current === chatId || messages.length === 0) return;
    settledChatId.current = chatId;
    prevLength.current = messages.length;
    stuckToBottom.current = true;
    scrollToBottom(false);
  }, [chatId, messages.length]);

  useEffect(() => {
    if (settledChatId.current !== chatId) {
      prevLength.current = messages.length;
      return;
    }
    if (messages.length > prevLength.current && stuckToBottom.current) scrollToBottom(true);
    prevLength.current = messages.length;
  }, [chatId, messages.length]);

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

  // Догрузка истории вверх не должна дёргать позицию: сохраняем scrollHeight до вставки
  // и возвращаем разницу сразу после неё, до кадра отрисовки.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || prependAnchor.current === null) return;
    el.scrollTop += el.scrollHeight - prependAnchor.current;
    prependAnchor.current = null;
  }, [messages.length]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stuckToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [chatId]);

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
  }

  function handleLoadMore(): void {
    prependAnchor.current = listRef.current?.scrollHeight ?? null;
    void loadMore(chatId);
  }

  const rows = useMemo(() => {
    const albums = groupAlbums(messages);

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
  const previousRows = prevRenderRowsRef.current;
  prevRenderRowsRef.current = renderRows;

  if (previousRows !== renderRows || leavingRows.size > 0) {
    const liveKeys = new Set(renderRows.map((entry) => entry.key));
    const gone = reconciled
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
        onScroll={handleScroll}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('[data-selectable]')) return;
          event.preventDefault();
        }}
      >
        <ScrollIndicator target={listRef} interactive />

        <div className={styles.filler} />

        {hasMore && (
          <button className={styles.loadMore} type="button" onClick={handleLoadMore}>
            Показать историю
          </button>
        )}

        {displayEntries.length === 0 && !hasMore && historyState === 'ready' && (
          <p className={styles.empty}>Сообщений пока нет. Напишите первым.</p>
        )}

        {displayEntries.length === 0 && historyState === 'offline' && (
          <p className={styles.empty}>Нет связи. История не загружена.</p>
        )}

        {displayEntries.map((entry) => (
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
        className={`${styles.jump} ${showJump ? '' : styles.jumpHidden}`}
        aria-label="К последним сообщениям"
        tabIndex={showJump ? 0 : -1}
        onClick={() => scrollToBottom(true)}
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
  const { message, groupIds, album, reactions, sameAuthorAsPrev, sameAuthorAsNext, showDay } = row;

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
      {showDay && <DateDivider iso={message.createdAt} />}
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
