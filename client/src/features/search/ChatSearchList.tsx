import type { MessageDto } from '@messenger/shared';
import { useEffect, useRef } from 'react';

import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../chats/EmptyState';
import { formatAttachmentDateTime } from '../messages/dayLabel';
import { scrollParentOf } from '../../ui/scrollParent';
import { highlight } from './SearchResults';
import styles from './ChatSearchList.module.css';

const LOAD_AHEAD_PX = 600;

interface ChatSearchListProps {
  messages: MessageDto[];
  query: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (messageId: number) => void;
}

/** Мобильный список найденного — поверх ленты, под полем поиска (R-33). Тап по строке
 *  прыгает к сообщению тем же приёмом, что и закреп (см. showInChat.focusMessageInChat). */
export function ChatSearchList({ messages, query, loading, hasMore, onLoadMore, onSelect }: ChatSearchListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current();
      },
      { root: scrollParentOf(sentinel), rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, messages.length]);

  if (query.trim().length === 0) return null;

  if (messages.length === 0) {
    return (
      <div className={styles.wrap}>
        {loading ? <p className={styles.hint}>Ищу…</p> : <EmptyState title="Ничего не нашлось" subtitle="Попробуйте другой запрос" />}
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} hide-native-scrollbar`}>
      {messages.map((message) => (
        <SearchRow key={message.id} message={message} query={query} onSelect={onSelect} />
      ))}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
      {loading && <p className={styles.hint}>Ищу…</p>}
    </div>
  );
}

function SearchRow({
  message,
  query,
  onSelect,
}: {
  message: MessageDto;
  query: string;
  onSelect: (messageId: number) => void;
}) {
  return (
    <button type="button" className={styles.row} onClick={() => onSelect(message.id)}>
      <Avatar
        label={message.sender?.displayName ?? '?'}
        avatarUrl={message.sender?.avatarUrl}
        size={44}
        color={message.sender?.avatarColor}
        colorKey={message.sender?.id}
      />
      <span className={styles.body}>
        <span className={styles.line}>
          <span className={styles.name}>{message.sender?.displayName ?? 'Удалённый аккаунт'}</span>
          <span className={styles.date}>{formatAttachmentDateTime(message.createdAt)}</span>
        </span>
        <span className={styles.snippet}>{highlight(message.content ?? '', query.trim())}</span>
      </span>
    </button>
  );
}
