import { ErrorCode, type ReportGroupDto, type ReportGroupView } from '@messenger/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { findAdminUserByUsernameRequest, listReportGroupsRequest } from '../api/admin';
import { ApiError } from '../api/client';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { ReportDetail } from '../features/admin/ReportDetail';
import { ReportGroupRow } from '../features/admin/ReportGroupRow';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../ui/Card';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { SegmentedControl } from '../ui/SegmentedControl';
import styles from './AdminScreen.module.css';

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'Пользователь не найден';
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

const REPORT_VIEW_SEGMENTS: { value: ReportGroupView; label: string }[] = [
  { value: 'open', label: 'Открытые' },
  { value: 'closed', label: 'Закрытые' },
];

/** Вкладка «Админ-панель»: поиск пользователя по username, переход в его карточку (R-32B)
 *  и разбор жалоб — группы по объекту, статусы, закрытие с решением (R-32D). Быстрый доступ
 *  из списка чатов — третий чипс рядом с «Предложкой» (`ChatFilters`, R-32D). */
export function AdminScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const role = useAuthStore((s) => s.user?.role);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reportView, setReportView] = useState<ReportGroupView>('open');
  const [reportGroups, setReportGroups] = useState<ReportGroupDto[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ReportGroupDto | null>(null);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

  const loadReports = useCallback((view: ReportGroupView) => {
    listReportGroupsRequest(view)
      .then((groups) => {
        setReportGroups(groups);
        setPasswordChangeRequired(false);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === ErrorCode.PASSWORD_CHANGE_REQUIRED) {
          setPasswordChangeRequired(true);
          return;
        }
        setReportsError(errorText(error));
      });
  }, []);

  useEffect(() => {
    if (role !== 'admin') return;
    loadReports(reportView);
  }, [role, reportView, loadReports]);

  function handleSearch(event: FormEvent): void {
    event.preventDefault();
    const username = query.trim();
    if (!username || busy) return;

    setBusy(true);
    setMessage(null);
    findAdminUserByUsernameRequest(username)
      .then((user) => navigate(`/admin/users/${user.id}`))
      .catch((error: unknown) => setMessage(errorText(error)))
      .finally(() => setBusy(false));
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        {!isDesktop && (
          <div className={styles.top}>
            <h1 className={styles.title}>Админ-панель</h1>
          </div>
        )}

        {role !== 'admin' ? (
          <Card caption="Администрирование">
            <Card.Row title="Нет доступа" subtitle="Этот экран только для администраторов" />
          </Card>
        ) : passwordChangeRequired ? (
          <Card caption="Администрирование">
            <Card.Row
              title="Смените пароль"
              subtitle="Роль выдана, но панель закрыта, пока пароль администратора не сменён на длинный"
              onClick={() => navigate('/settings/password')}
            />
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
              {message && <Card.Row title="Не найдено" subtitle={message} danger />}
            </Card>

            <Card caption="Управление">
              <Card.Row
                title="Журнал действий"
                subtitle="Кто, что и когда сделал"
                onClick={() => navigate('/admin/log')}
              />
            </Card>

            <Card caption="Жалобы">
              <div className={styles.reportsSwitch}>
                <SegmentedControl segments={REPORT_VIEW_SEGMENTS} value={reportView} onChange={setReportView} />
              </div>
              {reportsError && <Card.Row title="Ошибка" subtitle={reportsError} danger />}
              {!reportsError && reportGroups.length === 0 && (
                <Card.Row title={reportView === 'open' ? 'Открытых жалоб нет' : 'Закрытых жалоб нет'} />
              )}
              {reportGroups.map((group) => (
                <ReportGroupRow
                  key={`${group.kind}:${group.targetChatId ?? group.targetUserId}`}
                  group={group}
                  onOpen={() => setSelectedGroup(group)}
                />
              ))}
            </Card>
          </>
        )}
      </div>

      {selectedGroup && (
        <ReportDetail
          group={selectedGroup}
          view={reportView}
          onClose={() => setSelectedGroup(null)}
          onChanged={() => loadReports(reportView)}
        />
      )}
    </div>
  );
}
