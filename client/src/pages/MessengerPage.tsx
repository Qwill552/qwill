import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ChatList } from '../features/chats/ChatList';
import { MessageComposer } from '../features/messages/MessageComposer';
import { MessageList } from '../features/messages/MessageList';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import styles from './MessengerPage.module.css';

/** Ядро чатов этапа 2: список, приватный чат, отправка по сокету, пагинация (секция 10). */
export function MessengerPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const chats = useChatStore((s) => s.chats);
  const chatError = useChatStore((s) => s.chatError);
  const loadChats = useChatStore((s) => s.loadChats);
  const openChat = useChatStore((s) => s.openChat);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (chatId) void openChat(chatId);
  }, [chatId, openChat]);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  const activeChat = chats.find((c) => c.id === chatId);

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
            </header>
            <MessageList chatId={chatId} />
            <MessageComposer chatId={chatId} />
          </>
        )}
      </main>
    </div>
  );
}
