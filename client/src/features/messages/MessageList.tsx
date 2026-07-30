import { useEffect, useRef } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import styles from './MessageList.module.css';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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

      {messages.map((message) => {
        const isOwn = message.sender?.id === myId;
        const delivered = message.status !== 'sending' && message.status !== 'failed';
        const read = isOwn && delivered && isReadByOthers(readCursors, myId, message.id);
        const statusLabel =
          message.status === 'sending'
            ? 'отправка…'
            : message.status === 'failed'
              ? 'не доставлено'
              : formatTime(message.createdAt);

        return (
          <div key={message.clientId ?? message.id} className={`${styles.row} ${isOwn ? styles.rowOwn : ''}`}>
            <div
              className={`${styles.bubble} ${isOwn ? styles.bubbleOwn : styles.bubbleIn} ${
                message.status === 'failed' ? styles.bubbleFailed : ''
              }`}
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
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
