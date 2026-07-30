import { ApiError } from '../../api/client';
import { type FormEvent, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useChatStore } from '../../stores/chatStore';
import styles from './ChatList.module.css';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function ChatList() {
  const chats = useChatStore((s) => s.chats);
  const startPrivateChat = useChatStore((s) => s.startPrivateChat);
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
        {chats.length === 0 && <p className={styles.empty}>Пока нет чатов</p>}
        {chats.map((chat) => (
          <NavLink
            key={chat.id}
            to={`/chats/${chat.id}`}
            className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
          >
            <div className={styles.avatar}>{chat.title.charAt(0).toUpperCase()}</div>
            <div className={styles.itemBody}>
              <div className={styles.itemTop}>
                <span className={styles.itemTitle}>{chat.title}</span>
                {chat.lastMessage && (
                  <span className={styles.itemTime}>{formatTime(chat.lastMessage.createdAt)}</span>
                )}
              </div>
              <p className={styles.itemPreview}>{chat.lastMessage?.content ?? 'Нет сообщений'}</p>
            </div>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
