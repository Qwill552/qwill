import { useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatSearchStore } from '../../stores/chatSearchStore';
import { useChatStore } from '../../stores/chatStore';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { scrollParentOf } from '../../ui/scrollParent';
import { plural } from '../chat/plural';
import { ChatSearchFromPicker } from './ChatSearchFromPicker';
import { ChatSearchRow } from './ChatSearchRow';
import styles from './ChatSearchPanel.module.css';

const LOAD_AHEAD_PX = 600;

interface ChatSearchPanelProps {
  onDropChat: () => void;
}

export function ChatSearchPanel({ onDropChat }: ChatSearchPanelProps) {
  const chatId = useChatSearchStore((s) => s.chatId);
  const query = useChatSearchStore((s) => s.query);
  const results = useChatSearchStore((s) => s.results);
  const total = useChatSearchStore((s) => s.total);
  const index = useChatSearchStore((s) => s.index);
  const hasMore = useChatSearchStore((s) => s.hasMore);
  const loading = useChatSearchStore((s) => s.loading);
  const error = useChatSearchStore((s) => s.error);
  const fromUserId = useChatSearchStore((s) => s.fromUserId);
  const setFrom = useChatSearchStore((s) => s.setFrom);
  const loadMore = useChatSearchStore((s) => s.loadMore);
  const selectResult = useChatSearchStore((s) => s.selectResult);

  const chat = useChatStore((s) => s.chats.find((item) => item.id === chatId) ?? null);
  const members = useChatStore((s) => (chatId ? s.membersByChat[chatId] : undefined));
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

  if (!chatId) return null;

  const isGroup = chat?.type === 'GROUP';
  const fromMember = fromUserId ? members?.find((member) => member.userId === fromUserId) : undefined;
  const searching = query.trim().length > 0 || fromUserId !== null;

  return (
    <div className={styles.panel}>
      <p className={styles.label}>Поиск в чате:</p>

      <div className={styles.chips}>
        <span className={styles.chip}>
          <Avatar
            label={chat?.title ?? '?'}
            avatarUrl={chat?.avatarUrl}
            size={22}
            color={chat?.otherMember?.avatarColor}
            colorKey={chatId}
          />
          <span className={styles.chipLabel}>{chat?.title ?? 'Этот чат'}</span>
          <button type="button" className={styles.chipClose} aria-label="Искать везде" onClick={onDropChat}>
            <Icon name="close" size={14} />
          </button>
        </span>

        {isGroup && (
          <span className={styles.chip}>
            <button
              type="button"
              className={styles.chipLabelButton}
              onClick={() => setPickerOpen(true)}
            >
              {fromMember ? `От: ${fromMember.displayName}` : 'От кого'}
            </button>
            {fromUserId && (
              <button
                type="button"
                className={styles.chipClose}
                aria-label="Искать от всех"
                onClick={() => setFrom(null)}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
        )}
      </div>

      {error && <p className={styles.hint}>{error}</p>}

      {!error && !searching && <p className={styles.hint}>Введите, что искать в этой переписке</p>}

      {!error && searching && (
        <>
          <p className={styles.found}>
            {loading && results.length === 0
              ? 'Ищу…'
              : total === 0
                ? 'Ничего не найдено'
                : `Найдено ${total} ${plural(total, 'сообщение', 'сообщения', 'сообщений')}`}
          </p>
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
        </>
      )}

      {pickerOpen && (
        <ChatSearchFromPicker chatId={chatId} onPick={(userId) => setFrom(userId)} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
