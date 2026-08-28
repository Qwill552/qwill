import type { AdminReportDto, AdminUserDto } from '@messenger/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  banUserRequest,
  findAdminUserRequest,
  getAdminSettingsRequest,
  listReportsRequest,
  setProfileCardsRequest,
  setUserCardRequest,
  unbanUserRequest,
} from '../api/admin';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { Switch } from '../ui/Switch';
import styles from './AdminScreen.module.css';

const REPORT_KIND_TITLE: Record<string, string> = {
  card: 'Визитка',
  message: 'Сообщение',
  profile: 'Профиль',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

export function AdminScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const role = useAuthStore((s) => s.user?.role);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [found, setFound] = useState<AdminUserDto | null>(null);
  const [banReason, setBanReason] = useState('');
  const [cardsEnabled, setCardsEnabled] = useState(true);
  const [reports, setReports] = useState<AdminReportDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (role !== 'admin') return;
    getAdminSettingsRequest()
      .then((settings) => setCardsEnabled(settings.profileCardsEnabled))
      .catch((error: unknown) => setMessage(errorText(error)));
    listReportsRequest()
      .then(setReports)
      .catch((error: unknown) => setMessage(errorText(error)));
  }, [role]);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function handleSearch(event: FormEvent): void {
    event.preventDefault();
    if (!query.trim()) return;
    void run(async () => {
      const user = await findAdminUserRequest(query.trim());
      setFound(user);
      setBanReason(user.bannedReason ?? '');
    });
  }

  function handleBan(banned: boolean): void {
    if (!found) return;
    void run(async () => {
      const user = banned
        ? await banUserRequest(found.id, banReason.trim() || 'Нарушение правил')
        : await unbanUserRequest(found.id);
      setFound(user);
      setBanReason(user.bannedReason ?? '');
    });
  }

  function handleUserCard(disabled: boolean): void {
    if (!found) return;
    void run(async () => setFound(await setUserCardRequest(found.id, disabled)));
  }

  function handleGlobalCards(enabled: boolean): void {
    void run(async () => {
      const settings = await setProfileCardsRequest(enabled);
      setCardsEnabled(settings.profileCardsEnabled);
    });
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        {role !== 'admin' ? (
          <Card caption="Администрирование">
            <Card.Row title="Нет доступа" subtitle="Этот экран только для администраторов" />
          </Card>
        ) : (
          <>
            <Card caption="Пользователь">
              <form className={styles.search} onSubmit={handleSearch}>
                <input
                  className={styles.input}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Имя пользователя"
                />
                <button type="submit" className={styles.button} disabled={busy}>
                  Найти
                </button>
              </form>

              {found && (
                <>
                  <Card.Row title={`@${found.username}`} subtitle={found.displayName} />
                  <Card.Row title="Регистрация" value={formatDate(found.createdAt)} />
                  <Card.Row
                    title="Заблокирован"
                    subtitle={found.bannedAt ? formatDate(found.bannedAt) : 'Нет'}
                    trailing={
                      <Switch
                        checked={found.bannedAt !== null}
                        onChange={handleBan}
                        label="Заблокирован"
                      />
                    }
                  />
                  <div className={styles.reasonRow}>
                    <label className={styles.label} htmlFor="admin-ban-reason">
                      Причина блокировки
                    </label>
                    <input
                      id="admin-ban-reason"
                      className={styles.input}
                      value={banReason}
                      onChange={(event) => setBanReason(event.target.value)}
                      placeholder="Нарушение правил"
                    />
                  </div>
                  <Card.Row
                    title="Визитка выключена"
                    trailing={
                      <Switch
                        checked={found.cardDisabled}
                        onChange={handleUserCard}
                        label="Визитка выключена"
                      />
                    }
                  />
                </>
              )}
            </Card>

            <Card caption="Глобально">
              <Card.Row
                title="Визитки включены"
                subtitle="Рубильник для всех визиток сразу"
                trailing={
                  <Switch checked={cardsEnabled} onChange={handleGlobalCards} label="Визитки включены" />
                }
              />
            </Card>

            <Card caption={`Жалобы (${reports.length})`}>
              {reports.length === 0 ? (
                <Card.Row title="Пусто" subtitle="Жалоб пока нет" />
              ) : (
                reports.map((report) => (
                  <Card.Row
                    key={report.id}
                    title={`@${report.reporterUsername} → @${report.targetUsername}`}
                    subtitle={`${REPORT_KIND_TITLE[report.kind] ?? report.kind} · ${report.comment}`}
                    value={formatDate(report.createdAt)}
                  />
                ))
              )}
            </Card>

            {message && (
              <Card>
                <Card.Row title="Ошибка" subtitle={message} danger />
              </Card>
            )}
          </>
        )}
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад" onClick={() => navigate('/chats')} />
          <GlassPill title="Администрирование" />
        </ChromeBar>
      )}
    </div>
  );
}
