import { CHAT_TITLE_MAX_LENGTH } from '@messenger/shared';
import { type FormEvent, type KeyboardEvent, useState } from 'react';

import { ApiError } from '../../api/client';
import { useChatStore } from '../../stores/chatStore';
import styles from './CreateGroupModal.module.css';
import { Modal } from './Modal';

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (chatId: string) => void;
}

/** Название + список @username участников — поиска пользователей (этап 8) ещё нет, только точное имя (этап 7). */
export function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const createGroup = useChatStore((s) => s.createGroup);

  const [title, setTitle] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [usernames, setUsernames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleAddUsername(): void {
    const value = normalizeUsername(usernameInput);
    if (!value) return;
    if (!usernames.includes(value)) setUsernames((prev) => [...prev, value]);
    setUsernameInput('');
  }

  function handleUsernameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      handleAddUsername();
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Укажите название группы');
      return;
    }
    const allUsernames = [...usernames];
    const pendingUsername = normalizeUsername(usernameInput);
    if (pendingUsername && !allUsernames.includes(pendingUsername)) allUsernames.push(pendingUsername);
    if (allUsernames.length === 0) {
      setError('Добавьте хотя бы одного участника');
      return;
    }

    setPending(true);
    try {
      const chat = await createGroup(trimmedTitle, allUsernames);
      onCreated(chat.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось создать группу');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="Новая группа" onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="group-title">
            Название
          </label>
          <input
            id="group-title"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={CHAT_TITLE_MAX_LENGTH}
            placeholder="Например, Команда проекта"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="group-username">
            Участники
          </label>
          <div className={styles.addRow}>
            <input
              id="group-username"
              className={styles.input}
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={handleUsernameKeyDown}
              placeholder="@username"
            />
            <button className={styles.addButton} type="button" onClick={handleAddUsername} disabled={!usernameInput.trim()}>
              Добавить
            </button>
          </div>
          {usernames.length > 0 && (
            <div className={styles.chips}>
              {usernames.map((username) => (
                <span key={username} className={styles.chip}>
                  @{username}
                  <button
                    className={styles.chipRemove}
                    type="button"
                    onClick={() => setUsernames((prev) => prev.filter((u) => u !== username))}
                    aria-label={`Убрать @${username}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.submitButton} type="submit" disabled={pending}>
          Создать группу
        </button>
      </form>
    </Modal>
  );
}
