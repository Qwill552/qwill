import {
  AVATAR_MIME_TYPES,
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  PROFILE_CARD_MAX_BYTES,
  type BioMode,
  type UpdateProfileInput,
} from '@messenger/shared';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { setAvatarRequest } from '../api/auth';
import { ApiError } from '../api/client';
import { uploadFile } from '../api/files';
import {
  deleteOwnCardRequest,
  getOwnCardRequest,
  putCardPreviewRequest,
  putOwnCardRequest,
  updateProfileRequest,
} from '../api/users';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { Modal } from '../features/groups/Modal';
import { AvatarCropSheet } from '../features/media/AvatarCropSheet';
import { clearCardDraft, readCardDraft, writeCardDraft } from '../features/profile/cardDraft';
import { ProfileCardFrame } from '../features/profile/ProfileCardFrame';
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
import { formatBirthday } from '../utils/presence';
import styles from './ProfileEditScreen.module.css';

type EditableFieldKey = 'displayName' | 'birthday' | 'phone';

interface EditableFieldMeta {
  title: string;
  label: string;
  type: 'text' | 'date' | 'tel';
  maxLength?: number;
}

const FIELD_META: Record<EditableFieldKey, EditableFieldMeta> = {
  displayName: { title: 'Имя', label: 'Имя', type: 'text', maxLength: DISPLAY_NAME_MAX_LENGTH },
  birthday: { title: 'День рождения', label: 'Дата рождения', type: 'date' },
  phone: { title: 'Телефон', label: 'Номер телефона', type: 'tel', maxLength: PHONE_MAX_LENGTH },
};

const CARD_MAX_MB = Math.floor(PROFILE_CARD_MAX_BYTES / (1024 * 1024));
const DRAFT_WRITE_DELAY_MS = 400;

function formatBytes(bytes: number): string {
  return bytes.toLocaleString('ru-RU');
}

export function ProfileEditScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const loadProfile = useUserProfileStore((s) => s.load);
  const refreshProfile = useUserProfileStore((s) => s.refresh);
  const setProfileCache = useUserProfileStore((s) => s.setProfile);
  const storedProfile = useUserProfileStore((s) => s.profile);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const syncedProfileId = useRef<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [bio, setBio] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditableFieldKey | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [cardHtml, setCardHtml] = useState('');
  const [savedCardHtml, setSavedCardHtml] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [confirmingCardDelete, setConfirmingCardDelete] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const profile = storedProfile?.id === user?.id ? storedProfile : null;

  useEffect(() => {
    if (user?.id) loadProfile(user.id);
  }, [user?.id, loadProfile]);

  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
  }, [user?.displayName]);

  useEffect(() => {
    if (!profile || syncedProfileId.current === profile.id) return;
    syncedProfileId.current = profile.id;
    setPhone(profile.phone ?? '');
    setBirthday(profile.birthday ?? '');
    setBio(profile.bio ?? '');
    setAdvanced(profile.bioMode === 'html');
  }, [profile]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;
    getOwnCardRequest()
      .then((html) => {
        if (cancelled) return;
        setSavedCardHtml(html);
        setCardHtml(readCardDraft(userId) ?? html);
        setDraftRestored(true);
      })
      .catch(() => {
        if (cancelled) return;
        const draft = readCardDraft(userId);
        if (draft !== null) setCardHtml(draft);
        setDraftRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId || !draftRestored) return;

    const timer = window.setTimeout(() => {
      if (cardHtml === savedCardHtml) clearCardDraft(userId);
      else writeCardDraft(userId, cardHtml);
    }, DRAFT_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [cardHtml, savedCardHtml, draftRestored, user?.id]);

  useEffect(() => {
    const field = bioRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [bio]);

  const cardBytes = useMemo(() => new TextEncoder().encode(cardHtml).length, [cardHtml]);
  const cardTooLarge = cardBytes > PROFILE_CARD_MAX_BYTES;

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

  function openFieldEditor(field: EditableFieldKey): void {
    setDraftValue(field === 'displayName' ? displayName : field === 'birthday' ? birthday : phone);
    setEditingField(field);
  }

  function saveFieldEditor(): void {
    if (editingField === 'displayName') setDisplayName(draftValue);
    else if (editingField === 'birthday') setBirthday(draftValue);
    else if (editingField === 'phone') setPhone(draftValue);
    setEditingField(null);
  }

  async function applyBioMode(mode: BioMode): Promise<void> {
    const updated = await updateProfileRequest({ bioMode: mode });
    updateUser(updated);
    if (user?.id) await refreshProfile(user.id);
  }

  async function handleAdvancedToggle(next: boolean): Promise<void> {
    setAdvanced(next);
    setCardError(null);
    try {
      await applyBioMode(next ? 'html' : 'text');
    } catch (err) {
      setAdvanced(!next);
      setCardError(err instanceof ApiError ? err.message : 'Не удалось переключить режим');
    }
  }

  async function handleCardImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > PROFILE_CARD_MAX_BYTES) {
      setCardError(`Файл больше ${CARD_MAX_MB} МБ — он не поместится в визитку`);
      return;
    }
    setCardError(null);
    setCardHtml(await file.text());
  }

  async function handlePreview(): Promise<void> {
    setPreviewPending(true);
    setCardError(null);
    try {
      const preview = await putCardPreviewRequest(cardHtml);
      setPreviewUrl(preview.url);
    } catch (err) {
      setCardError(err instanceof ApiError ? err.message : 'Не удалось собрать предпросмотр');
    } finally {
      setPreviewPending(false);
    }
  }

  async function handleCardDelete(): Promise<void> {
    setConfirmingCardDelete(false);
    setCardError(null);
    try {
      await deleteOwnCardRequest();
      setCardHtml('');
      setSavedCardHtml('');
      setPreviewUrl(null);
      setAdvanced(false);
      if (user?.id) await refreshProfile(user.id);
    } catch (err) {
      setCardError(err instanceof ApiError ? err.message : 'Не удалось удалить визитку');
    }
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

    const cardChanged = cardHtml !== savedCardHtml;
    if (cardChanged && cardTooLarge) {
      setCardError(`Визитка не больше ${CARD_MAX_MB} МБ`);
      return;
    }

    if (Object.keys(input).length === 0 && !cardChanged) {
      navigate('/profile');
      return;
    }

    setPending(true);
    setError(null);
    try {
      if (cardChanged) {
        await putOwnCardRequest(cardHtml);
        setSavedCardHtml(cardHtml);
      }
      if (Object.keys(input).length > 0) {
        const updatedUser = await updateProfileRequest(input);
        updateUser(updatedUser);
        setProfileCache({
          ...profile,
          displayName: updatedUser.displayName,
          phone: 'phone' in input ? (input.phone ?? null) : profile.phone,
          birthday: 'birthday' in input ? (input.birthday ?? null) : profile.birthday,
          bio: 'bio' in input ? (input.bio ?? null) : profile.bio,
        });
      }
      if (cardChanged) await refreshProfile(user.id);
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

        {!advanced && (
          <>
            <Card className={styles.cardReset}>
              <div className={styles.bioBox}>
                <span className={styles.bioCounter}>{bioRemaining}</span>
                <textarea
                  ref={bioRef}
                  className={styles.bioInput}
                  rows={1}
                  value={bio}
                  maxLength={BIO_MAX_LENGTH}
                  placeholder="О себе"
                  aria-label="О себе"
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
            </Card>
            <p className={styles.hint}>
              Любые подробности: возраст, род занятий или город. Например: 23 года, дизайнер из
              Санкт-Петербурга.
            </p>
          </>
        )}

        <Card className={styles.cardReset}>
          <Card.Row
            title="Продвинутый режим"
            subtitle="HTML-визитка вместо текста «О себе»"
            trailing={
              <Switch
                checked={advanced}
                onChange={(next) => void handleAdvancedToggle(next)}
                label="Продвинутый режим"
              />
            }
          />
        </Card>

        {advanced && (
          <>
            <div className={styles.codeBox}>
              <textarea
                className={styles.codeInput}
                value={cardHtml}
                rows={12}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                placeholder="&lt;h1&gt;Привет&lt;/h1&gt;"
                aria-label="HTML-визитка"
                onChange={(e) => setCardHtml(e.target.value)}
              />
              <div className={styles.codeFoot}>
                <span className={`${styles.codeCounter} ${cardTooLarge ? styles.codeCounterOver : ''}`}>
                  {formatBytes(cardBytes)} Б из {formatBytes(PROFILE_CARD_MAX_BYTES)}
                </span>
                <button
                  type="button"
                  className={styles.codeAction}
                  onClick={() => cardInputRef.current?.click()}
                >
                  Импорт
                </button>
                <button
                  type="button"
                  className={styles.codeAction}
                  onClick={() => void handlePreview()}
                  disabled={previewPending || cardTooLarge}
                >
                  {previewPending ? 'Собираем…' : previewUrl ? 'Обновить предпросмотр' : 'Предпросмотр'}
                </button>
              </div>
            </div>

            <input
              ref={cardInputRef}
              className={styles.hiddenInput}
              type="file"
              accept=".html,text/html"
              onChange={(e) => void handleCardImport(e)}
            />

            {cardError && <p className={styles.error}>{cardError}</p>}

            <p className={styles.hint}>
              Визитку показывает отдельное окно в песочнице: скрипты внутри работают, выход
              наружу — в сеть, в приложение, к чужим адресам — закрыт. Часть тегов сервер
              вырезает при сохранении, предпросмотр показывает уже очищенный вид.
            </p>

            {previewUrl && user && (
              <ProfileCardFrame
                cardUrl={previewUrl}
                authorId={user.id}
                authorName={user.displayName}
                autoStart
              />
            )}

            <button
              type="button"
              className={styles.cardDelete}
              onClick={() => setConfirmingCardDelete(true)}
            >
              Удалить визитку
            </button>
          </>
        )}

        <Card className={styles.cardReset}>
          <Card.Row icon="user" tint="blue" title="Имя" value={displayName} onClick={() => openFieldEditor('displayName')} />
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
            value={birthday ? formatBirthday(birthday) : 'Не указан'}
            onClick={() => openFieldEditor('birthday')}
          />
        </Card>

        <Card className={styles.cardReset}>
          <Card.Row icon="phone" tint="teal" title="Телефон" value={phone || 'Не указан'} onClick={() => openFieldEditor('phone')} />
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

      {editingField && (
        <Modal title={FIELD_META[editingField].title} onClose={() => setEditingField(null)}>
          <label className={styles.editFieldLabel} htmlFor="profile-field-input">
            {FIELD_META[editingField].label}
          </label>
          <input
            id="profile-field-input"
            className={styles.editFieldInput}
            type={FIELD_META[editingField].type}
            value={draftValue}
            maxLength={FIELD_META[editingField].maxLength}
            autoFocus
            onChange={(e) => setDraftValue(e.target.value)}
          />
          <div className={styles.editFieldActions}>
            <button type="button" className={styles.editFieldCancel} onClick={() => setEditingField(null)}>
              Отмена
            </button>
            <button type="button" className={styles.editFieldSave} onClick={saveFieldEditor}>
              Сохранить
            </button>
          </div>
        </Modal>
      )}

      {confirmingCardDelete && (
        <Modal title="Удалить визитку?" onClose={() => setConfirmingCardDelete(false)}>
          <p className={styles.confirmText}>
            Код визитки будет удалён без возможности вернуть, а «О себе» снова станет обычным
            текстом — тем, что был до включения продвинутого режима.
          </p>
          <div className={styles.editFieldActions}>
            <button
              type="button"
              className={styles.editFieldCancel}
              onClick={() => setConfirmingCardDelete(false)}
            >
              Отмена
            </button>
            <button type="button" className={styles.confirmDelete} onClick={() => void handleCardDelete()}>
              Удалить
            </button>
          </div>
        </Modal>
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
