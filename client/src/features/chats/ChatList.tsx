import { ApiError } from '../../api/client';
import { type FormEvent, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useChatStore } from '../../stores/chatStore';
import { Avatar } from './Avatar';
import styles from './ChatList.module.css';
import { EmptyState } from './EmptyState';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function ChatList() {
  const chats = useChatStore((s) => s.chats);
  const startPrivateChat = useChatStore((s) => s.startPrivateChat);
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleStartChat(event: FormEvent): Promise<void> {
    event.preventDefault();
    const value = username.trim();
    if (!value) return;

    setPending(true);
    setError(null);
    try {
      const chat = await startPrivateChat(value);
      setUsername('');
      navigate(`/chats/${chat.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось начать чат');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.sidebar}>
      <form className={styles.newChat} onSubmit={(e) => void handleStartChat(e)}>
        <input
          className={styles.input}
          placeholder="@username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button className={styles.newChatButton} type="submit" disabled={pending}>
          Написать
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}

      <nav className={styles.list}>
        {chats.length === 0 && (
          <EmptyState
            title="Пока нет чатов"
            subtitle="Введите @username выше, чтобы написать первому и начать переписку"
          />
        )}
        {chats.map((chat) => {
          const online = chat.otherMember ? (presenceByUser[chat.otherMember.id]?.online ?? false) : false;

          return (
            <NavLink
              key={chat.id}
              to={`/chats/${chat.id}`}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
            >
              <Avatar label={chat.title} size={52} online={online} />
              <div className={styles.itemBody}>
                <div className={styles.itemTop}>
                  <span className={styles.itemTitle}>{chat.title}</span>
                  {chat.lastMessage && (
                    <span className={styles.itemTime}>{formatTime(chat.lastMessage.createdAt)}</span>
                  )}
                </div>
                <div className={styles.itemBottom}>
                  <p className={styles.itemPreview}>{chat.lastMessage?.content ?? 'Нет сообщений'}</p>
                  {chat.unreadCount > 0 && <span className={styles.badge}>{chat.unreadCount}</span>}
                </div>
              </div>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
