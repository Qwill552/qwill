import { useEffect, useRef } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import styles from './MessageList.module.css';

/** Сообщения одного автора ближе этого интервала визуально группируются (секция 5: хвостик только у последнего). */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/** Прочитано всеми, кроме автора, — курсоры участников есть всегда, даже «никогда не читал» (null) (секция 3). */
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

export function MessageList({ chatId }: { chatId: string }) {
  const messages = useChatStore((s) => s.messagesByChat[chatId]) ?? [];
  const hasMore = useChatStore((s) => s.hasMoreByChat[chatId]) ?? false;
  const loadMore = useChatStore((s) => s.loadMore);
  const readCursors = useChatStore((s) => s.readCursorsByChat[chatId]);
  const myId = useAuthStore((s) => s.user?.id) ?? null;

  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLength = useRef(0);

  useEffect(() => {
    // Автоскролл только при появлении новых сообщений или смене чата, не при догрузке истории сверху.
    bottomRef.current?.scrollIntoView({ behavior: prevLength.current ? 'smooth' : 'auto' });
    prevLength.current = messages.length;
  }, [chatId, messages.length]);

  return (
    <div className={styles.list}>
      {hasMore && (
        <button className={styles.loadMore} type="button" onClick={() => void loadMore(chatId)}>
          Загрузить ещё
        </button>
      )}

      {messages.map((message, index) => {
        const prev = messages[index - 1];
        const next = messages[index + 1];

        const groupedWithPrev =
          !!prev &&
          prev.sender?.id === message.sender?.id &&
          isSameDay(prev.createdAt, message.createdAt) &&
          new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;

        const groupedWithNext =
          !!next &&
          next.sender?.id === message.sender?.id &&
          isSameDay(next.createdAt, message.createdAt) &&
          new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() < GROUP_WINDOW_MS;

        const showDayDivider = !prev || !isSameDay(prev.createdAt, message.createdAt);

        const isOwn = message.sender?.id === myId;
        const delivered = message.status !== 'sending' && message.status !== 'failed';
        const read = isOwn && delivered && isReadByOthers(readCursors, myId, message.id);
        const statusLabel =
          message.status === 'sending'
            ? 'отправка…'
            : message.status === 'failed'
              ? 'не доставлено'
              : formatTime(message.createdAt);

        const full = 'var(--radius-bubble)';
        const tight = 'var(--radius-bubble-tight)';
        const cornerStyle = isOwn
          ? {
              borderTopLeftRadius: full,
              borderTopRightRadius: groupedWithPrev ? tight : full,
              borderBottomRightRadius: groupedWithNext ? tight : full,
              borderBottomLeftRadius: full,
            }
          : {
              borderTopLeftRadius: groupedWithPrev ? tight : full,
              borderTopRightRadius: full,
              borderBottomRightRadius: full,
              borderBottomLeftRadius: groupedWithNext ? tight : full,
            };

        return (
          <div key={message.clientId ?? message.id}>
            {showDayDivider && (
              <div className={styles.dayDivider}>
                <span>{formatDayLabel(message.createdAt)}</span>
              </div>
            )}
            <div
              className={`${styles.row} ${isOwn ? styles.rowOwn : ''} ${groupedWithPrev ? styles.rowGrouped : ''}`}
            >
              <div
                className={`${styles.bubble} ${isOwn ? styles.bubbleOwn : styles.bubbleIn} ${
                  message.status === 'failed' ? styles.bubbleFailed : ''
                }`}
                style={cornerStyle}
              >
                <p className={styles.text}>{message.content}</p>
                <span className={styles.time}>
                  {statusLabel}
                  {isOwn && delivered && (
                    <span className={`${styles.check} ${read ? styles.checkRead : ''}`}>
                      {read ? '✓✓' : '✓'}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
