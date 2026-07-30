import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ChatList } from '../features/chats/ChatList';
import { MessageComposer } from '../features/messages/MessageComposer';
import { MessageList } from '../features/messages/MessageList';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import styles from './MessengerPage.module.css';

function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  return `был(а) в сети ${day} в ${time}`;
}

/** Ядро чатов + прочтение, счётчики, «печатает», онлайн (секция 10, этапы 2–3). */
export function MessengerPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const chats = useChatStore((s) => s.chats);
  const chatError = useChatStore((s) => s.chatError);
  const loadChats = useChatStore((s) => s.loadChats);
  const openChat = useChatStore((s) => s.openChat);
  const closeChat = useChatStore((s) => s.closeChat);
  const typingUsers = useChatStore((s) => (chatId ? s.typingByChat[chatId] : undefined)) ?? [];
  const presenceByUser = useChatStore((s) => s.presenceByUser);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!chatId) return;
    void openChat(chatId);
    return () => closeChat();
  }, [chatId, openChat, closeChat]);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  const activeChat = chats.find((c) => c.id === chatId);

  let subtitle: string | null = null;
  if (typingUsers.length > 0) {
    subtitle =
      activeChat?.type === 'GROUP' ? `${typingUsers.map((u) => u.displayName).join(', ')} печатает…` : 'печатает…';
  } else if (activeChat?.type === 'PRIVATE' && activeChat.otherMember) {
    const presence = presenceByUser[activeChat.otherMember.id];
    subtitle = presence?.online ? 'в сети' : formatLastSeen(presence?.lastSeenAt ?? activeChat.otherMember.lastSeenAt);
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.me}>{user?.displayName}</span>
          <button className={styles.logout} type="button" onClick={() => void handleLogout()}>
            Выйти
          </button>
        </div>
        <ChatList />
      </aside>

      <main className={styles.main}>
        {!chatId && (
          <div className={styles.empty}>
            <p>Выберите чат или начните новый</p>
          </div>
        )}

        {chatId && chatError && (
          <div className={styles.empty}>
            <p>{chatError}</p>
          </div>
        )}

        {chatId && !chatError && (
          <>
            <header className={styles.chatHeader}>
              <span className={styles.chatTitle}>{activeChat?.title ?? '…'}</span>
              {subtitle && (
                <span className={`${styles.chatSubtitle} ${typingUsers.length > 0 ? styles.chatSubtitleTyping : ''}`}>
                  {subtitle}
                </span>
              )}
            </header>
            <MessageList chatId={chatId} />
            <MessageComposer chatId={chatId} />
          </>
        )}
      </main>
    </div>
  );
}
