import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MessageReactionDto } from '@messenger/shared';
import { createPortal } from 'react-dom';

import { useAuthStore } from '../../stores/authStore';
import { type LocalMessage, useChatStore } from '../../stores/chatStore';
import { Badge } from '../../ui/Badge';
import { bumpScrollEpoch } from '../../ui/gestures/gestureReducer';
import { Icon } from '../../ui/Icon';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { isServiceChat } from '../chat/serviceChat';
import { groupAlbums, mergeReactions } from '../media/albums';
import { DateDivider, UnreadDivider } from './Dividers';
import { MessageBubble } from './MessageBubble';
import { MessageReactions } from './MessageReactions';
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

  useEffect(() => {
    const grew = messages.length > prevLength.current;
    const first = prevLength.current === 0;
    if (grew && (first || stuckToBottom.current)) scrollToBottom(!first);
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
    const ms = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-menu')) || 0;
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

        {messages.length === 0 && !hasMore && (
          <p className={styles.empty}>Сообщений пока нет. Напишите первым.</p>
        )}

        {rows.map((row) => {
          const own = row.message.sender?.id === myId;
          const delivered = row.message.status !== 'sending' && row.message.status !== 'failed';
          const isReal = row.message.id > 0;
          const canAct = isReal && !row.message.deletedAt;

          return (
            <MessageListRow
              key={row.message.clientId ?? row.message.id}
              row={row}
              chatId={chatId}
              myId={myId}
              isGroup={isGroup}
              own={own}
              read={own && delivered && isReadByOthers(readCursors, myId, row.lastId)}
              isReal={isReal}
              canEdit={own && canAct && isEditableMessage(row.message)}
              canDelete={(own || isGroupAdmin) && canAct}
              canPin={canPinBase && canAct}
              canReply={!isService}
              canReact={!isService}
              isPinned={pinnedMessage !== null && row.groupIds.includes(pinnedMessage.id)}
              showUnread={unreadAnchor.current !== null && row.groupIds.includes(unreadAnchor.current)}
              unreadCount={unreadCount}
              onReply={onReply}
              onEdit={onEdit}
              onForwardRequest={onForwardRequest}
              onToggleReaction={toggleReaction}
            />
          );
        })}

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

const MessageListRow = memo(function MessageListRow({
  row,
  chatId,
  myId,
  isGroup,
  own,
  read,
  isReal,
  canEdit,
  canDelete,
  canPin,
  canReply,
  canReact,
  isPinned,
  showUnread,
  unreadCount,
  onReply,
  onEdit,
  onForwardRequest,
  onToggleReaction,
}: {
  row: MessageRowData;
  chatId: string;
  myId: string | null;
  isGroup: boolean;
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
  unreadCount: number;
  onReply: (message: LocalMessage) => void;
  onEdit: (message: LocalMessage) => void;
  onForwardRequest: (messageIds: number[]) => void;
  onToggleReaction: (chatId: string, messageId: number, emoji: string) => void;
}) {
  const { message, groupIds, album, reactions, sameAuthorAsPrev, sameAuthorAsNext, showDay } = row;

  return (
    <>
      {showDay && <DateDivider iso={message.createdAt} />}
      {showUnread && <UnreadDivider count={unreadCount} />}

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
          {isReal && !message.deletedAt && (
            <MessageReactions
              reactions={reactions}
              myId={myId}
              chatId={chatId}
              onToggle={(emoji) => onToggleReaction(chatId, message.id, emoji)}
            />
          )}
        </MessageBubble>
      </MessageRow>
    </>
  );
});
