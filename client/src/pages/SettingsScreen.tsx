import { AVATAR_MIME_TYPES } from '@messenger/shared';
import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { setAvatarRequest } from '../api/auth';
import { ApiError } from '../api/client';
import { uploadFile } from '../api/files';
import { isApkUpdateSupported, selectUpdateAvailable, useAppUpdateStore } from '../app/appUpdate';
import { countPendingOutbox } from '../cache/outbox';
import { formatBytes } from '../features/messages/Attachment';
import { Modal } from '../features/groups/Modal';
import { UpdateModal } from '../features/updates/UpdateModal';
import { useAuthStore } from '../stores/authStore';
import { useChatListPrefsStore } from '../stores/chatListPrefsStore';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { Switch } from '../ui/Switch';
import styles from './SettingsScreen.module.css';

/** Значок камеры на аватаре — буквально из референса (строка 191): нестандартные
 *  пропорции (14×12, viewBox 16×14) не ложатся в общую сетку 24 иконок Icon, поэтому
 *  инлайнится как есть, тем же приёмом, что и статичные иконки ContactsScreen. */
function CameraBadgeIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 16 14" fill="none" aria-hidden="true">
      <rect x="1" y="3" width="14" height="10" rx="3" stroke="#fff" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.6" stroke="#fff" strokeWidth="1.5" />
      <path d="M6 3l1-2h2l1 2" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Вкладка «Настройки». Буквально из референса (строки 184-216): шапка профиля без
 *  заголовка экрана (его в источнике нет) и две карточки-группы по 4 строки. Разделы,
 *  за которыми нет рабочей функции (Конфиденциальность, Уведомления, Данные и память,
 *  Устройства, Энергосбережение), всё равно нарисованы — иконка, тон, текст, курсор/hover
 *  один в один — но не кликабельны (правило CLAUDE.md: строка без функции переносится,
 *  но не выдумывается замена). «Выйти из аккаунта» в референсе нет вовсе (демо не знает
 *  выхода из аккаунта), но без него из приложения нельзя выйти — оставлено отдельной
 *  карточкой, как и на предыдущем этапе (см. ux-ui.md, запись про экраны 2026-08-01). */
export function SettingsScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const folderTabsEnabled = useChatListPrefsStore((s) => s.folderTabsEnabled);
  const setFolderTabsEnabled = useChatListPrefsStore((s) => s.setFolderTabsEnabled);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Верх шапки профиля (аватар) — старт трека индикатора прокрутки. */
  const profileRef = useRef<HTMLDivElement>(null);
  /** Низ отображаемого имени — трек останавливается здесь, чуть выше нижнего края блока
   *  профиля (не доезжая до @username), по прямой просьбе пользователя, см. ux-ui.md. */
  const nameRef = useRef<HTMLSpanElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const updateInfo = useAppUpdateStore((s) => s.info);
  const updateAvailable = useAppUpdateStore(selectUpdateAvailable);
  const currentVersionName = useAppUpdateStore((s) => s.currentVersionName);

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

  async function handleLogout(): Promise<void> {
    const pending = await countPendingOutbox();
    if (pending > 0) {
      setPendingOutboxCount(pending);
      return;
    }
    await confirmLogout();
  }

  async function confirmLogout(): Promise<void> {
    setLoggingOut(true);
    setPendingOutboxCount(null);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={styles.screen}>
      <div ref={scrollerRef} className={`${styles.scroller} hide-native-scrollbar`}>
        <ScrollIndicator target={scrollerRef} mode="bounded" boundsTop={profileRef} boundsBottom={nameRef} />
        <div ref={profileRef} className={styles.profile}>
          <button
            className={styles.avatarButton}
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            aria-label="Сменить фото профиля"
          >
            <Avatar
              label={user?.displayName ?? '?'}
              avatarUrl={user?.avatarUrl}
              size={96}
              color={user?.avatarColor}
            />
            <span className={styles.cameraBadge}>
              <CameraBadgeIcon />
            </span>
          </button>
          <input
            ref={avatarInputRef}
            className={styles.hiddenInput}
            type="file"
            accept={AVATAR_MIME_TYPES.join(',')}
            onChange={(e) => void handleAvatarChange(e)}
          />
          <span ref={nameRef} className={styles.name}>{user?.displayName}</span>
          <span className={styles.username}>@{user?.username}</span>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <Card className={styles.cardReset}>
          <Card.Row
            icon="user"
            tint="blue"
            title="Аккаунт"
            subtitle="Номер, имя пользователя, «О себе»"
            onClick={() => navigate('/profile')}
          />
          <Card.Row
            icon="chats"
            tint="orange"
            title="Настройки чатов"
            subtitle="Обои, ночной режим, анимации"
            onClick={() => navigate('/settings/appearance')}
          />
          <Card.Row
            icon="lock"
            tint="green"
            title="Конфиденциальность"
            subtitle="Время захода, устройства, ключи"
            chevron
            className={styles.inert}
          />
          <Card.Row
            icon="bell"
            tint="pink"
            title="Уведомления"
            subtitle="Звуки, звонки, счётчик сообщений"
            chevron
            className={styles.inert}
          />
        </Card>

        <Card className={styles.cardReset}>
          <Card.Row
            icon="database"
            tint="teal"
            title="Данные и память"
            subtitle="Настройки загрузки медиафайлов"
            chevron
            className={styles.inert}
          />
          {/* «Сортировка чатов по папкам» — единственная строка группы, за которой стоит
              рабочая функция (вкладки списка чатов), поэтому вместо стрелки — переключатель,
              как и на предыдущем этапе (перенесено вместе с самой функцией). */}
          <Card.Row
            icon="folder"
            tint="blue"
            title="Папки с чатами"
            subtitle="Сортировка чатов по папкам"
            trailing={
              <Switch checked={folderTabsEnabled} onChange={setFolderTabsEnabled} label="Папки с чатами" />
            }
          />
          <Card.Row
            icon="monitor"
            tint="violet"
            title="Устройства"
            subtitle="Управление активными сеансами"
            chevron
            className={styles.inert}
          />
          <Card.Row
            icon="battery"
            tint="orange"
            title="Энергосбережение"
            subtitle="Экономия энергии при низком заряде"
            chevron
            className={styles.inert}
          />
        </Card>

        {updateAvailable && updateInfo && (
          <Card className={styles.cardReset}>
            <Card.Row
              icon="retry"
              tint="green"
              title="Доступно обновление"
              subtitle={`Версия ${updateInfo.versionName} · ${formatBytes(updateInfo.sizeBytes)}`}
              onClick={() => setUpdateOpen(true)}
            />
          </Card>
        )}

        <Card className={styles.cardReset}>
          <Card.Row
            icon="settings"
            tint="teal"
            title="Для разработчиков"
            subtitle="Отладочные переключатели"
            onClick={() => navigate('/settings/developer')}
          />
        </Card>

        <Card className={styles.cardReset}>
          <Card.Row
            icon="logout"
            tint="red"
            title="Выйти из аккаунта"
            danger
            onClick={() => !loggingOut && void handleLogout()}
          />
        </Card>

        {isApkUpdateSupported() && currentVersionName && (
          <p className={styles.version}>Qwill {currentVersionName}</p>
        )}
      </div>

      {updateOpen && <UpdateModal onClose={() => setUpdateOpen(false)} />}

      {pendingOutboxCount != null && (
        <Modal title="Выйти из аккаунта" onClose={() => setPendingOutboxCount(null)} opaque>
          <p className={styles.confirmText}>
            В очереди осталось неотправленных сообщений: {pendingOutboxCount}. Если выйти, они будут удалены.
          </p>
          <div className={styles.confirmActions}>
            <button
              className={styles.stayButton}
              type="button"
              onClick={() => setPendingOutboxCount(null)}
              disabled={loggingOut}
            >
              Остаться
            </button>
            <button
              className={styles.discardButton}
              type="button"
              onClick={() => void confirmLogout()}
              disabled={loggingOut}
            >
              Выйти и удалить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
