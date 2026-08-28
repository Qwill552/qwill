import {
  AVATAR_MIME_TYPES,
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  type UpdateProfileInput,
} from '@messenger/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { setAvatarRequest } from '../api/auth';
import { ApiError } from '../api/client';
import { uploadFile } from '../api/files';
import { updateProfileRequest } from '../api/users';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { AvatarCropSheet } from '../features/media/AvatarCropSheet';
import { useAuthStore } from '../stores/authStore';
import { useUserProfileStore } from '../stores/userProfileStore';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { Icon } from '../ui/Icon';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { Switch } from '../ui/Switch';
import styles from './ProfileEditScreen.module.css';

export function ProfileEditScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const loadProfile = useUserProfileStore((s) => s.load);
  const setProfileCache = useUserProfileStore((s) => s.setProfile);
  const storedProfile = useUserProfileStore((s) => s.profile);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [bio, setBio] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = storedProfile?.id === user?.id ? storedProfile : null;

  useEffect(() => {
    if (user?.id) loadProfile(user.id);
  }, [user?.id, loadProfile]);

  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
  }, [user?.displayName]);

  useEffect(() => {
    if (!profile) return;
    setPhone(profile.phone ?? '');
    setBirthday(profile.birthday ?? '');
    setBio(profile.bio ?? '');
  }, [profile]);

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

  async function handleSave(): Promise<void> {
    if (!user || !profile) return;

    const effectiveName = displayName.trim() || user.displayName;
    const trimmedPhone = phone.trim();
    const trimmedBio = bio.trim();

    const input: UpdateProfileInput = {};
    if (effectiveName !== user.displayName) input.displayName = effectiveName;
    if (trimmedPhone !== (profile.phone ?? '')) input.phone = trimmedPhone === '' ? null : trimmedPhone;
    if (birthday !== (profile.birthday ?? '')) input.birthday = birthday === '' ? null : birthday;
    if (trimmedBio !== (profile.bio ?? '')) input.bio = trimmedBio === '' ? null : trimmedBio;

    if (Object.keys(input).length === 0) {
      navigate('/profile');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const updatedUser = await updateProfileRequest(input);
      updateUser(updatedUser);
      setProfileCache({
        ...profile,
        displayName: updatedUser.displayName,
        phone: 'phone' in input ? (input.phone ?? null) : profile.phone,
        birthday: 'birthday' in input ? (input.birthday ?? null) : profile.birthday,
        bio: 'bio' in input ? (input.bio ?? null) : profile.bio,
      });
      navigate('/profile');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить профиль');
    } finally {
      setPending(false);
    }
  }

  const avatarUrl = user?.avatarUrl;
  const bioRemaining = BIO_MAX_LENGTH - bio.length;

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        <div className={styles.hero}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatarRing}>
              <Avatar label={user?.displayName ?? '?'} avatarUrl={avatarUrl} size={107} color={user?.avatarColor} />
            </div>
            <button
              type="button"
              className={styles.avatarCamera}
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Сменить фото профиля"
            >
              <Icon name="camera" size={18} />
            </button>
          </div>
        </div>

        <input
          ref={avatarInputRef}
          className={styles.hiddenInput}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          onChange={handleAvatarChange}
        />

        {error && <p className={styles.error}>{error}</p>}

        <Card className={styles.cardReset}>
          <div className={styles.bioBox}>
            <span className={styles.bioCounter}>{bioRemaining}</span>
            <textarea
              className={styles.bioInput}
              value={bio}
              maxLength={BIO_MAX_LENGTH}
              aria-label="О себе"
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </Card>
        <p className={styles.hint}>
          Любые подробности: возраст, род занятий или город. Например: 23 года, дизайнер из
          Санкт-Петербурга.
        </p>

        <Card className={styles.cardReset}>
          <Card.Row
            icon="settings"
            tint="indigo"
            title="Продвинутый режим"
            subtitle="HTML-визитка — скоро"
            trailing={<Switch checked={false} onChange={() => undefined} disabled label="Продвинутый режим" />}
          />
        </Card>

        <Card className={styles.cardReset}>
          <Card.Row
            icon="user"
            tint="blue"
            title="Имя"
            trailing={
              <input
                className={styles.fieldInput}
                value={displayName}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                aria-label="Имя"
                onChange={(e) => setDisplayName(e.target.value)}
              />
            }
          />
          <Card.Row
            icon="at"
            tint="violet"
            title="Имя пользователя"
            value={<span className={styles.accent}>{`@${user?.username ?? ''}`}</span>}
          />
        </Card>
        <p className={styles.hint}>Имя пользователя нельзя изменить после регистрации</p>

        <Card className={styles.cardReset}>
          <Card.Row
            icon="cake"
            tint="pink"
            title="День рождения"
            trailing={
              <input
                type="date"
                className={styles.fieldInput}
                value={birthday}
                aria-label="День рождения"
                onChange={(e) => setBirthday(e.target.value)}
              />
            }
          />
        </Card>

        <Card className={styles.cardReset}>
          <Card.Row
            icon="phone"
            tint="teal"
            title="Телефон"
            trailing={
              <input
                type="tel"
                className={styles.fieldInput}
                value={phone}
                maxLength={PHONE_MAX_LENGTH}
                placeholder="Не указан"
                aria-label="Телефон"
                onChange={(e) => setPhone(e.target.value)}
              />
            }
          />
        </Card>

        <button type="button" className={styles.saveButton} onClick={() => void handleSave()} disabled={pending || !profile}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>

      {cropSource && (
        <AvatarCropSheet
          file={cropSource}
          onClose={() => setCropSource(null)}
          onCropped={(cropped) => void handleAvatarCropped(cropped)}
        />
      )}

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в профиль" onClick={() => navigate('/profile')} />
          <GlassPill title="Изменить профиль" />
          <GlassButton icon="qrcode" label="QR-код профиля" disabled aria-disabled="true" />
        </ChromeBar>
      )}
    </div>
  );
}
