import { AVATAR_MIME_TYPES, DISPLAY_NAME_MAX_LENGTH } from '@messenger/shared';
import { useRef, useState, type ChangeEvent } from 'react';

import { setAvatarRequest } from '../../api/auth';
import { ApiError } from '../../api/client';
import { uploadFile } from '../../api/files';
import { updateProfileRequest } from '../../api/users';
import { Avatar } from '../chats/Avatar';
import { useAuthStore } from '../../stores/authStore';
import { Modal } from '../groups/Modal';
import styles from './ProfilePanel.module.css';

interface ProfilePanelProps {
  onClose: () => void;
}

/** Профиль — displayName и аватар; username не редактируется по дизайну (этап 8). */
export function ProfilePanel({ onClose }: ProfilePanelProps) {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.displayName ?? '');
  const [nameEditing, setNameEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setAvatarUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, 'avatar');
      updateUser(await setAvatarRequest(uploaded.id, uploaded.sha256));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сменить аватар');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleNameSave(): Promise<void> {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === user?.displayName) {
      setNameEditing(false);
      setNameDraft(user?.displayName ?? '');
      return;
    }
    setPending(true);
    setError(null);
    try {
      updateUser(await updateProfileRequest({ displayName: trimmed }));
      setNameEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить имя');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="Профиль" onClose={onClose}>
      <div className={styles.avatarRow}>
        <button
          className={styles.avatarButton}
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarUploading}
          title="Сменить аватар"
          aria-label="Сменить аватар"
        >
          <Avatar label={user?.displayName ?? '?'} avatarUrl={user?.avatarUrl} size={64} />
        </button>
        <input
          ref={avatarInputRef}
          className={styles.hiddenInput}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          onChange={(e) => void handleAvatarChange(e)}
        />

        <div className={styles.identity}>
          {nameEditing ? (
            <div className={styles.nameRow}>
              <input
                className={styles.nameInput}
                value={nameDraft}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
              />
              <button className={styles.saveButton} type="button" onClick={() => void handleNameSave()} disabled={pending}>
                Сохранить
              </button>
            </div>
          ) : (
            <span className={styles.name} onClick={() => setNameEditing(true)} title="Изменить имя">
              {user?.displayName}
            </span>
          )}
          <span className={styles.username}>@{user?.username}</span>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </Modal>
  );
}
