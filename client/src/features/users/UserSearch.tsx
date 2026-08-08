import type { UserSearchResult } from '@messenger/shared';
import { useEffect, useState } from 'react';

import { ApiError } from '../../api/client';
import { searchUsersRequest } from '../../api/users';
import { useChatStore } from '../../stores/chatStore';
import { Avatar } from '../../ui/Avatar';
import { Modal } from '../groups/Modal';
import styles from './UserSearch.module.css';

interface UserSearchProps {
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
}

/** Поиск пользователей по подстроке username с debounce, клик по результату открывает/создаёт приватный чат (этап 8). */
export function UserSearch({ onClose, onOpenChat }: UserSearchProps) {
  const startPrivateChat = useChatStore((s) => s.startPrivateChat);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      searchUsersRequest(trimmed)
        .then((data) => {
          setResults(data.results);
          setError(null);
        })
        .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Не удалось выполнить поиск'))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  async function handleSelect(user: UserSearchResult): Promise<void> {
    setOpeningId(user.id);
    setError(null);
    try {
      const chat = await startPrivateChat(user.username);
      onOpenChat(chat.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось начать чат');
      setOpeningId(null);
    }
  }

  const trimmedQuery = query.trim();

  return (
    <Modal title="Найти пользователя" onClose={onClose}>
      <input
        className={styles.input}
        placeholder="Введите имя пользователя"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.results}>
        {loading && <p className={styles.hint}>Поиск…</p>}
        {!loading && trimmedQuery.length > 0 && trimmedQuery.length < 2 && (
          <p className={styles.hint}>Введите ещё хотя бы один символ</p>
        )}
        {!loading && trimmedQuery.length >= 2 && results.length === 0 && !error && (
          <p className={styles.hint}>Никого не нашлось</p>
        )}
        {results.map((user) => (
          <button
            key={user.id}
            type="button"
            className={styles.result}
            disabled={openingId === user.id}
            onClick={() => void handleSelect(user)}
          >
            <Avatar label={user.displayName} avatarUrl={user.avatarUrl} size={40} color={user.avatarColor} />
            <div className={styles.resultBody}>
              <span className={styles.resultName}>{user.displayName}</span>
              <span className={styles.resultUsername}>
                @{user.username}
                {user.isContact ? ' · уже переписываетесь' : ''}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
