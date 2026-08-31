import type { ReportGroupDto, ReportGroupView } from '@messenger/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { closeReportRequest, markReportWorkingRequest } from '../../api/admin';
import { getUserProfileRequest } from '../../api/users';
import { Card } from '../../ui/Card';
import { Sheet } from '../../ui/Sheet';
import { ProfileCardFrame } from '../profile/ProfileCardFrame';
import styles from './ReportDetail.module.css';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function reportGroupTitle(group: ReportGroupDto): string {
  if (group.kind === 'card') return `Визитка @${group.targetUsername}`;
  if (group.kind === 'profile') return `Профиль @${group.targetUsername}`;
  return group.chatTitle || 'Чат';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

interface ReportDetailProps {
  group: ReportGroupDto;
  view: ReportGroupView;
  onClose: () => void;
  onChanged: () => void;
}

export function ReportDetail({ group, view, onClose, onChanged }: ReportDetailProps) {
  const navigate = useNavigate();
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workedNow, setWorkedNow] = useState(false);
  const [closedNow, setClosedNow] = useState<string | null>(null);

  useEffect(() => {
    if (group.kind !== 'card') return;
    getUserProfileRequest(group.targetUserId)
      .then((profile) => setCardUrl(profile.cardUrl))
      .catch(() => setCardUrl(null));
  }, [group.kind, group.targetUserId]);

  function openUserCard(): void {
    onClose();
    navigate(`/admin/users/${group.targetUserId}`);
  }

  async function handleWork(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await markReportWorkingRequest(group.latestReportId);
      setWorkedNow(true);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(): Promise<void> {
    const text = resolution.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await closeReportRequest(group.latestReportId, text);
      setClosedNow(text);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={reportGroupTitle(group)} onClose={onClose}>
      <div className={styles.body}>
        {group.kind === 'card' && (
          <>
            {cardUrl ? (
              <ProfileCardFrame cardUrl={cardUrl} authorId={group.targetUserId} authorName={group.targetDisplayName} />
            ) : (
              <Card caption="Объект жалобы">
                <Card.Row title="Визитки нет" subtitle="Выключена или ещё не создана" />
              </Card>
            )}
            <Card caption="Пользователь">
              <Card.Row title="Открыть в панели пользователя" onClick={openUserCard} />
            </Card>
          </>
        )}

        {group.kind === 'profile' && (
          <Card caption="Объект жалобы">
            <Card.Row title={`Карточка пользователя @${group.targetUsername}`} onClick={openUserCard} />
          </Card>
        )}

        {group.kind === 'message' && (
          <Card caption="Объект жалобы">
            <Card.Row title={group.chatTitle ?? 'Чат'} subtitle="Чтение переписки появится в 32G" />
            <Card.Row title="Открыть в панели пользователя" onClick={openUserCard} />
          </Card>
        )}

        <Card caption={`Жалобы (${group.reports.length})`}>
          {group.reports.map((report) => (
            <Card.Row
              key={report.id}
              title={`@${report.reporterUsername}`}
              subtitle={
                report.targetMessageId != null ? `«${report.comment}» · сообщение #${report.targetMessageId}` : `«${report.comment}»`
              }
              value={formatDateTime(report.createdAt)}
            />
          ))}
        </Card>

        {view === 'closed' ? (
          <Card caption="Решение">
            <Card.Row title={group.resolution ?? '—'} subtitle={group.closedAt ? formatDateTime(group.closedAt) : undefined} />
          </Card>
        ) : closedNow ? (
          <Card caption="Разбор">
            <Card.Row title="Жалоба закрыта" subtitle={closedNow} />
          </Card>
        ) : (
          <Card caption="Разбор">
            {group.hasNew && !workedNow && (
              <Card.Row
                title="Взять в работу"
                onClick={!busy ? () => void handleWork() : undefined}
                chevron={false}
              />
            )}
            {workedNow && <Card.Row title="Взято в работу" chevron={false} />}
            <div className={styles.closeForm}>
              <textarea
                className={styles.textarea}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="Что решили по этой жалобе"
                rows={3}
                aria-label="Текст решения"
              />
              <button
                type="button"
                className={styles.button}
                disabled={busy || resolution.trim() === ''}
                onClick={() => void handleClose()}
              >
                Закрыть жалобу
              </button>
            </div>
            {error && <Card.Row title="Ошибка" subtitle={error} danger />}
          </Card>
        )}
      </div>
    </Sheet>
  );
}
