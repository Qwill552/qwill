import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

import { isTypingTarget } from '../../app/hotkeys';
import { useChatStore } from '../../stores/chatStore';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { Skeleton } from '../../ui/Skeleton';
import { ChatRow } from './ChatRow';
import type { ChatFilter } from './ChatFilters';
import styles from './ChatList.module.css';
import { EmptyState } from './EmptyState';
import { selectVisibleChats } from './visibleChats';

export interface ChatListHandle {
  /** Тап по активной вкладке «Сообщения» в таб-баре — первый раз наверх (этап 2). */
  scrollToTop: () => void;
  /** Тап по активной вкладке второй раз подряд — к первому непрочитанному (этап 2). */
  scrollToFirstUnread: () => void;
  restoreScrollTop: (top: number) => void;
  revealChat: (chatId: string) => void;
}

interface ChatListProps {
  /** Живой колбэк скролла — на unmount React уже обнуляет ref потомка раньше, чем
   *  успевает отработать cleanup родительского эффекта, поэтому читать позицию
   *  «в момент ухода» через ref ненадёжно; вызывающий обязан копить её сам (этап 2). */
  onScroll?: (top: number) => void;
  filter?: ChatFilter;
}

/** Буквально из референса (строка 112): сам список — отдельный скроллер под шапкой
 *  (аватар/поиск/чипсы), а не общая прокрутка со всем экраном — шапка в нём не едет. */
export const ChatList = forwardRef<ChatListHandle, ChatListProps>(function ChatList(
  { onScroll, filter = 'all' },
  ref,
) {
  const chats = useChatStore((s) => s.chats);
  const chatsLoaded = useChatStore((s) => s.chatsLoaded);
  const chatError = useChatStore((s) => s.chatError);
  const loadChats = useChatStore((s) => s.loadChats);
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const typingByChat = useChatStore((s) => s.typingByChat);
  const myUserId = useChatStore((s) => s.myUserId);
  const listRef = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToTop() {
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    scrollToFirstUnread() {
      listRef.current?.querySelector<HTMLElement>('[data-unread="true"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    },
    restoreScrollTop(top) {
      if (listRef.current) listRef.current.scrollTop = top;
    },
    revealChat(chatId) {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-chat-id="${chatId}"]`);
      if (!row) return;
      if (!isTypingTarget(document.activeElement)) row.focus({ preventScroll: true });
      row.scrollIntoView({ block: 'nearest' });
    },
  }));

  const visible = useMemo(() => selectVisibleChats(chats, filter), [chats, filter]);

  const loading = !chatsLoaded && chats.length === 0;

  return (
    <nav
      className={`${styles.list} hide-native-scrollbar`}
      ref={listRef}
      onScroll={onScroll ? (e) => onScroll(e.currentTarget.scrollTop) : undefined}
    >
      <ScrollIndicator target={listRef} />

      {chatError && (
        <div className={styles.error} role="alert">
          <span>{chatError}</span>
          <button type="button" className={styles.retry} onClick={() => void loadChats()}>
            Повторить
          </button>
        </div>
      )}

      {loading &&
        Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton width={54} height={54} circle />
            <div className={styles.skeletonBody}>
              <Skeleton width="45%" height={14} />
              <Skeleton width="70%" height={12} />
            </div>
          </div>
        ))}

      {!loading && visible.length === 0 && (
        <div className={styles.empty}>
          {chats.length === 0 ? (
            <EmptyState
              title="Пока нет чатов"
              subtitle="Нажмите «Написать», чтобы найти человека и начать переписку"
            />
          ) : (
            <EmptyState title="Ничего не подходит" subtitle="В этом фильтре пока пусто" />
          )}
        </div>
      )}

      {visible.map((chat, index) => (
        <ChatRow
          key={chat.id}
          chat={chat}
          myUserId={myUserId}
          online={chat.otherMember ? (presenceByUser[chat.otherMember.id]?.online ?? false) : false}
          typingNames={(typingByChat[chat.id] ?? []).map((u) => u.displayName)}
          index={index}
        />
      ))}
    </nav>
  );
});
