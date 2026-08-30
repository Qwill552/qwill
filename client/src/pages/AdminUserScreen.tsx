import type { AdminUserCardDto } from '@messenger/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  banUserRequest,
  clearAdminUserAvatarRequest,
  clearAdminUserBioRequest,
  clearAdminUserCardRequest,
  getAdminUserRequest,
  muteUserSupportRequest,
  revokeAdminUserSessionsRequest,
  setAdminUserDisplayNameRequest,
  setUserCardRequest,
  unbanUserRequest,
} from '../api/admin';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { PiiReveal } from '../features/admin/PiiReveal';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { Switch } from '../ui/Switch';
import styles from './AdminUserScreen.module.css';

const BIO_MODE_TITLE: Record<string, string> = {
  text: 'Текст',
  html: 'Визитка',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

export function AdminUserScreen() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const userId = params.id ?? '';
  const isDesktop = useLayoutMode() === 'desktop';
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<AdminUserCardDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [muteUntil, setMuteUntil] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    getAdminUserRequest(userId)
      .then((loaded) => {
        setUser(loaded);
        setBanReason(loaded.bannedReason ?? '');
        setDisplayName(loaded.displayName);
        setMuteUntil(loaded.supportMutedUntil ? toDatetimeLocalValue(loaded.supportMutedUntil) : '');
      })
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<AdminUserCardDto>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setUser(await action());
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function handleBan(banned: boolean): void {
    void run(() =>
      banned ? banUserRequest(userId, banReason.trim() || 'Нарушение правил') : unbanUserRequest(userId),
    );
  }

  function handleCardDisabled(disabled: boolean): void {
    void run(async () => {
      await setUserCardRequest(userId, disabled);
      return getAdminUserRequest(userId);
    });
  }

  function handleSaveName(): void {
    const trimmed = displayName.trim();
    if (!user || !trimmed || trimmed === user.displayName) return;
    void run(() => setAdminUserDisplayNameRequest(userId, trimmed));
  }

  function handleClearAvatar(): void {
    void run(() => clearAdminUserAvatarRequest(userId));
  }

  function handleClearCard(): void {
    void run(() => clearAdminUserCardRequest(userId));
  }

  function handleClearBio(): void {
    void run(() => clearAdminUserBioRequest(userId));
  }

  function handleRevokeSessions(): void {
    void run(() => revokeAdminUserSessionsRequest(userId));
  }

  function handleMuteSupport(): void {
    if (!muteUntil) return;
    void run(() => muteUserSupportRequest(userId, new Date(muteUntil).toISOString()));
  }

  function handleUnmuteSupport(): void {
    void run(() => muteUserSupportRequest(userId, null));
  }

  const body = (
    <>
      <ScrollIndicator target={scrollerRef} />

      {loadError && (
        <Card caption="Пользователь">
          <Card.Row title="Не удалось загрузить" subtitle={loadError} danger />
        </Card>
      )}

      {user && (
        <>
          <Card caption="Пользователь">
            <Card.Row title={`@${user.username}`} subtitle={`Роль: ${user.role}`} />
            <Card.Row title="Регистрация" value={formatDate(user.createdAt)} />
            <Card.Row title="Последний визит" value={formatDate(user.lastSeenAt)} />
            <div className={styles.nameRow}>
              <input
                className={styles.input}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-label="Отображаемое имя"
              />
              <button
                type="button"
                className={styles.button}
                disabled={busy || !displayName.trim() || displayName.trim() === user.displayName}
                onClick={handleSaveName}
              >
                Сохранить
              </button>
            </div>
          </Card>

          <Card caption="Счётчики">
            <Card.Row title="Чатов" value={user.chatCount} />
            <Card.Row title="Сообщений" value={user.messageCount} />
            <Card.Row title="Жалоб на него" value={user.reportsAgainst} />
            <Card.Row title="Жалоб от него" value={user.reportsFiled} />
            <Card.Row title="Активных сессий" value={user.sessionCount} />
          </Card>

          <Card caption="Блокировка">
            <Card.Row
              title="Заблокирован"
              subtitle={
                user.bannedAt
                  ? `${formatDate(user.bannedAt)}${user.bannedByUsername ? ` · @${user.bannedByUsername}` : ''}`
                  : 'Нет'
              }
              trailing={<Switch checked={user.bannedAt !== null} onChange={handleBan} label="Заблокирован" disabled={busy} />}
            />
            <div className={styles.reasonRow}>
              <label className={styles.label} htmlFor="admin-user-ban-reason">
                Причина блокировки
              </label>
              <input
                id="admin-user-ban-reason"
                className={styles.input}
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
                placeholder="Нарушение правил"
              />
            </div>
          </Card>

          <Card caption="Поддержка">
            <Card.Row
              title="Заглушён от обращений"
              subtitle={user.supportMutedUntil ? `до ${formatDate(user.supportMutedUntil)}` : 'Нет'}
            />
            <div className={styles.reasonRow}>
              <label className={styles.label} htmlFor="admin-user-support-mute-until">
                Заглушить до
              </label>
              <input
                id="admin-user-support-mute-until"
                type="datetime-local"
                className={styles.input}
                value={muteUntil}
                onChange={(event) => setMuteUntil(event.target.value)}
              />
            </div>
            <div className={styles.nameRow}>
              <button
                type="button"
                className={styles.button}
                disabled={busy || !muteUntil}
                onClick={handleMuteSupport}
              >
                Заглушить
              </button>
              {user.supportMutedUntil && (
                <button type="button" className={styles.button} disabled={busy} onClick={handleUnmuteSupport}>
                  Снять заглушение
                </button>
              )}
            </div>
          </Card>

          <Card caption="Визитка и профиль">
            <Card.Row
              title="Визитка выключена"
              trailing={
                <Switch
                  checked={user.cardDisabled}
                  onChange={handleCardDisabled}
                  label="Визитка выключена"
                  disabled={busy}
                />
              }
            />
            <Card.Row title="Режим «О себе»" value={BIO_MODE_TITLE[user.bioMode] ?? user.bioMode} />
            <Card.Row
              title="Снять аватар"
              subtitle={user.hasAvatar ? undefined : 'Аватара нет'}
              onClick={user.hasAvatar && !busy ? handleClearAvatar : undefined}
              chevron={false}
              danger={user.hasAvatar}
            />
            <Card.Row
              title="Снять визитку"
              subtitle={user.hasCard ? undefined : 'Визитки нет'}
              onClick={user.hasCard && !busy ? handleClearCard : undefined}
              chevron={false}
              danger={user.hasCard}
            />
            <Card.Row
              title="Снять «О себе»"
              subtitle={user.hasBio ? undefined : 'Текста нет'}
              onClick={user.hasBio && !busy ? handleClearBio : undefined}
              chevron={false}
              danger={user.hasBio}
            />
          </Card>

          <PiiReveal userId={userId} />

          <Card caption="Сессии">
            <Card.Row
              title="Разорвать все сессии"
              subtitle="Пользователя выкинет со всех устройств, это не бан"
              onClick={!busy ? handleRevokeSessions : undefined}
              chevron={false}
              danger
            />
          </Card>

          {message && (
            <Card>
              <Card.Row title="Ошибка" subtitle={message} danger />
            </Card>
          )}
        </>
      )}
    </>
  );

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        {body}
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в админ-панель" onClick={() => navigate('/admin')} />
          <GlassPill title={user ? `@${user.username}` : 'Пользователь'} />
        </ChromeBar>
      )}
    </div>
  );
}
