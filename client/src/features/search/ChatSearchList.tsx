import { useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatSearchStore } from '../../stores/chatSearchStore';
import { useChatStore } from '../../stores/chatStore';
import { Chip } from '../../ui/Chip';
import { scrollParentOf } from '../../ui/scrollParent';
import { EmptyState } from '../chats/EmptyState';
import { ChatSearchFromPicker } from './ChatSearchFromPicker';
import { ChatSearchRow } from './ChatSearchRow';
import styles from './ChatSearchList.module.css';

const LOAD_AHEAD_PX = 600;

interface ChatSearchListProps {
  chatId: string;
  isGroup: boolean;
}

export function ChatSearchList({ chatId, isGroup }: ChatSearchListProps) {
  const results = useChatSearchStore((s) => s.results);
  const query = useChatSearchStore((s) => s.query);
  const index = useChatSearchStore((s) => s.index);
  const loading = useChatSearchStore((s) => s.loading);
  const hasMore = useChatSearchStore((s) => s.hasMore);
  const fromUserId = useChatSearchStore((s) => s.fromUserId);
  const loadMore = useChatSearchStore((s) => s.loadMore);
  const selectResult = useChatSearchStore((s) => s.selectResult);
  const setFrom = useChatSearchStore((s) => s.setFrom);
  const members = useChatStore((s) => s.membersByChat[chatId]);
  const myId = useAuthStore((s) => s.user?.id) ?? null;

  const [pickerOpen, setPickerOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreRef.current();
      },
      { root: scrollParentOf(sentinel), rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, results.length]);

  const fromMember = fromUserId ? members?.find((member) => member.userId === fromUserId) : undefined;

  return (
    <div className={`${styles.wrap} hide-native-scrollbar`}>
      {isGroup && (
        <div className={styles.chips}>
          <Chip
            label={fromMember ? `От: ${fromMember.displayName}` : 'От кого'}
            active={Boolean(fromUserId)}
            onClick={() => (fromUserId ? setFrom(null) : setPickerOpen(true))}
          />
        </div>
      )}

      {results.length === 0 ? (
        <div className={styles.empty}>
          {loading ? (
            <p className={styles.hint}>Ищу…</p>
          ) : (
            <EmptyState title="Ничего не нашлось" subtitle="Попробуйте другой запрос" />
          )}
        </div>
      ) : (
        <>
          {results.map((message, position) => (
            <ChatSearchRow
              key={message.id}
              message={message}
              query={query}
              own={message.sender?.id === myId}
              active={position === index}
              onSelect={() => selectResult(position)}
            />
          ))}
          {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
          {loading && <p className={styles.hint}>Ищу…</p>}
        </>
      )}

      {pickerOpen && (
        <ChatSearchFromPicker chatId={chatId} onPick={(userId) => setFrom(userId)} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
