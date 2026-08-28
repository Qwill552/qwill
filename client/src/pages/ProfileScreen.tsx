import { AVATAR_MIME_TYPES, DISPLAY_NAME_MAX_LENGTH, type UserProfileDto } from '@messenger/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { setAvatarRequest } from '../api/auth';
import { ApiError } from '../api/client';
import { uploadFile } from '../api/files';
import { getUserProfileRequest, updateProfileRequest } from '../api/users';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { AvatarCropSheet } from '../features/media/AvatarCropSheet';
import { openAvatarViewer } from '../features/media/avatarViewerStore';
import { useAuthStore } from '../stores/authStore';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../ui/Icon';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { formatBirthday } from '../utils/presence';
import styles from './ProfileScreen.module.css';

export function ProfileScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [nameDraft, setNameDraft] = useState(user?.displayName ?? '');
  const [nameEditing, setNameEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getUserProfileRequest(user.id)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function uploadAvatar(file: File): Promise<void> {
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

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setCropSource(file);
  }

  async function handleAvatarCropped(cropped: File): Promise<void> {
    setCropSource(null);
    await uploadAvatar(cropped);
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

  function startNameEdit(): void {
    setNameDraft(user?.displayName ?? '');
    setNameEditing(true);
  }

  const actions: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }[] = [
    {
      icon: 'camera',
      label: 'Выбрать фото',
      onClick: () => avatarInputRef.current?.click(),
      disabled: avatarUploading,
    },
    { icon: 'edit', label: 'Изменить', onClick: startNameEdit },
    { icon: 'settings', label: 'Настройки', onClick: () => navigate('/settings') },
  ];

  const avatarUrl = user?.avatarUrl;

  return (
    <div className={styles.screen}>
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />
        <div className={styles.hero}>
          {avatarUrl ? (
            <button
              type="button"
              className={styles.avatarRing}
              onClick={() => openAvatarViewer(avatarUrl, user?.displayName ?? '')}
              aria-label="Открыть фото профиля"
            >
              <Avatar label={user?.displayName ?? '?'} avatarUrl={avatarUrl} size={107} color={user?.avatarColor} />
            </button>
          ) : (
            <div className={styles.avatarRing}>
              <Avatar label={user?.displayName ?? '?'} avatarUrl={undefined} size={107} color={user?.avatarColor} />
            </div>
          )}

          {nameEditing ? (
            <div className={styles.nameEditRow}>
              <input
                className={styles.nameInput}
                value={nameDraft}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                aria-label="Имя"
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleNameSave();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setNameEditing(false);
                  }
                }}
              />
              <button
                type="button"
                className={styles.saveButton}
                aria-label="Сохранить имя"
                onClick={() => void handleNameSave()}
                disabled={pending}
              >
                <Icon name="check" size={18} />
              </button>
            </div>
          ) : (
            <span className={styles.name}>{user?.displayName}</span>
          )}
          <span className={styles.status}>в сети</span>
        </div>

        <input
          ref={avatarInputRef}
          className={styles.hiddenInput}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          onChange={handleAvatarChange}
        />

        <div className={isDesktop ? card.actionRow : styles.actions}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={isDesktop ? card.actionTile : styles.action}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              <Icon name={action.icon} size={23} className={isDesktop ? card.actionTileIcon : undefined} />
              {action.label}
            </button>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {profile?.bio && (
          <Card caption="О себе">
            <p className={styles.bioText}>{profile.bio}</p>
          </Card>
        )}

        <Card className={styles.cardReset}>
          {profile?.phone && <Card.Row title={profile.phone} subtitle="Телефон" />}
          <Card.Row title={<span className={styles.accent}>{`@${user?.username ?? ''}`}</span>} subtitle="Имя пользователя" />
          {profile?.birthday && <Card.Row title={formatBirthday(profile.birthday)} subtitle="День рождения" />}
        </Card>
      </div>

      {cropSource && (
        <AvatarCropSheet
          file={cropSource}
          onClose={() => setCropSource(null)}
          onCropped={(cropped) => void handleAvatarCropped(cropped)}
        />
      )}
    </div>
  );
}
