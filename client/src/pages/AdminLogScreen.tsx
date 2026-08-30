import { ADMIN_ACTION_VALUES, type AdminLogEntryDto } from '@messenger/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listAdminLogRequest } from '../api/admin';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './AdminLogScreen.module.css';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось загрузить журнал';
}

function entrySubtitle(entry: AdminLogEntryDto): string {
  const target = entry.targetUsername ? `@${entry.targetUsername}` : entry.targetChatId ? 'чат' : '—';
  return `${entry.action} · ${target} · ${entry.ip}`;
}

/** Журнал администрирования: только чтение, без единого пишущего маршрута (R-32B).
 *  Курсорная пагинация — как в остальном API. */
export function AdminLogScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [adminFilter, setAdminFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const [entries, setEntries] = useState<AdminLogEntryDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function query(cursorValue?: string) {
    return {
      admin: adminFilter.trim() || undefined,
      action: actionFilter || undefined,
      from: fromFilter || undefined,
      to: toFilter || undefined,
      cursor: cursorValue,
    };
  }

  function loadFirstPage(): void {
    setBusy(true);
    setError(null);
    listAdminLogRequest(query())
      .then((page) => {
        setEntries(page.entries);
        setCursor(page.nextCursor);
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    loadFirstPage();
  }, []);

  function handleLoadMore(): void {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    listAdminLogRequest(query(cursor))
      .then((page) => {
        setEntries((prev) => [...prev, ...page.entries]);
        setCursor(page.nextCursor);
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false));
  }

  function handleFilterSubmit(): void {
    loadFirstPage();
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        <Card caption="Фильтры">
          <div className={styles.filters}>
            <input
              className={styles.input}
              value={adminFilter}
              onChange={(event) => setAdminFilter(event.target.value)}
              placeholder="Администратор"
              aria-label="Фильтр по администратору"
            />
            <select
              className={styles.select}
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              aria-label="Фильтр по типу действия"
            >
              <option value="">Любое действие</option>
              {ADMIN_ACTION_VALUES.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              type="date"
              value={fromFilter}
              onChange={(event) => setFromFilter(event.target.value)}
              aria-label="С даты"
            />
            <input
              className={styles.input}
              type="date"
              value={toFilter}
              onChange={(event) => setToFilter(event.target.value)}
              aria-label="По дату"
            />
          </div>
          <Card.Row title="Применить фильтры" onClick={handleFilterSubmit} chevron={false} />
        </Card>

        <Card caption={`Журнал (${entries.length})`}>
          {entries.length === 0 && !busy ? (
            <Card.Row title="Пусто" subtitle="Действий пока не было" />
          ) : (
            entries.map((entry) => (
              <Card.Row
                key={entry.id}
                title={entry.adminUsername ? `@${entry.adminUsername}` : entry.adminId}
                subtitle={entrySubtitle(entry)}
                value={formatDateTime(entry.createdAt)}
              />
            ))
          )}
        </Card>

        {error && (
          <Card>
            <Card.Row title="Ошибка" subtitle={error} danger />
          </Card>
        )}

        {cursor && (
          <button type="button" className={styles.loadMore} onClick={handleLoadMore} disabled={busy}>
            Показать ещё
          </button>
        )}
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в админ-панель" onClick={() => navigate('/admin')} />
          <GlassPill title="Журнал" />
        </ChromeBar>
      )}
    </div>
  );
}
