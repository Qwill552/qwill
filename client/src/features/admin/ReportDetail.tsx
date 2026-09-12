import type { AdminUserCardDto, ReportGroupDto, ReportGroupView } from '@messenger/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  clearAdminUserCardRequest,
  closeReportRequest,
  getAdminUserRequest,
  markReportWorkingRequest,
  setUserCardRequest,
} from '../../api/admin';
import { getUserProfileRequest } from '../../api/users';
import { Card } from '../../ui/Card';
import { IconButton } from '../../ui/IconButton';
import { Menu } from '../../ui/Menu';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
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
  const [target, setTarget] = useState<AdminUserCardDto | null>(null);
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workedNow, setWorkedNow] = useState(false);
  const [closedNow, setClosedNow] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<{ reportId: string; anchor: DOMRect } | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const loadCard = useCallback(() => {
    getUserProfileRequest(group.targetUserId)
      .then((profile) => setCardUrl(profile.cardUrl))
      .catch(() => setCardUrl(null));
  }, [group.targetUserId]);

  useEffect(() => {
    if (group.kind !== 'card') return;
    loadCard();
    getAdminUserRequest(group.targetUserId)
      .then(setTarget)
      .catch(() => setTarget(null));
  }, [group.kind, group.targetUserId, loadCard]);

  function openReportMenu(reportId: string): void {
    const node = rowRefs.current.get(reportId);
    if (!node) return;
    setMenuFor({ reportId, anchor: node.getBoundingClientRect() });
  }

  function toggleReportText(reportId: string): void {
    setExpanded((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId],
    );
  }

  function openProfile(userId: string): void {
    onClose();
    navigate(`/admin/users/${userId}/profile`);
  }

  function openAdminCard(userId: string): void {
    onClose();
    navigate(`/admin/users/${userId}`);
  }

  function openChat(chatId: string): void {
    onClose();
    navigate(`/admin/chats/${chatId}`);
  }

  async function runCardAction(action: () => Promise<AdminUserCardDto>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setTarget(await action());
      loadCard();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
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

  const cardActions = (
    <div className={styles.quickActions}>
      <div className={styles.quickRow}>
        <span className={styles.quickLabel}>Визитка выключена</span>
        <Switch
          checked={target?.cardDisabled ?? false}
          onChange={(next) => void runCardAction(() => setUserCardRequest(group.targetUserId, next))}
          label="Визитка выключена"
          disabled={busy || !target}
        />
      </div>
      <button
        type="button"
        className={styles.dangerButton}
        disabled={busy || !target?.hasCard}
        onClick={() => void runCardAction(() => clearAdminUserCardRequest(group.targetUserId))}
      >
        {target?.hasCard ? 'Удалить визитку' : 'Код визитки уже пуст'}
      </button>
      <p className={styles.quickHint}>
        Рубильник прячет визитку и запирает редактор — код остаётся. «Удалить визитку» стирает
        код без возможности восстановления.
      </p>
    </div>
  );

  return (
    <Sheet
      title={reportGroupTitle(group)}
      onClose={onClose}
      action={
        <IconButton
          icon="user"
          label={`Профиль @${group.targetUsername}`}
          onClick={() => openProfile(group.targetUserId)}
        />
      }
    >
      <div className={styles.body}>
        {group.kind === 'card' && (
          <>
            {cardUrl ? (
              <ProfileCardFrame
                cardUrl={cardUrl}
                authorId={group.targetUserId}
                authorName={group.targetDisplayName}
                footer={cardActions}
              />
            ) : (
              <Card caption="Объект жалобы">
                <Card.Row
                  title="Визитка не показывается"
                  subtitle={target?.cardDisabled ? 'Выключена рубильником ниже' : 'Кода нет или режим «О себе» текстовый'}
                />
                {cardActions}
              </Card>
            )}
          </>
        )}

        {group.kind === 'message' && (
          <Card caption="Объект жалобы">
            <Card.Row
              title={group.chatTitle ?? 'Чат'}
              subtitle="Открыть переписку в режиме чтения"
              onClick={group.targetChatId ? () => openChat(group.targetChatId!) : undefined}
            />
          </Card>
        )}

        <Card caption="Нарушитель">
          <Card.Row
            title={`Профиль @${group.targetUsername}`}
            subtitle="Как его видят обычные люди"
            onClick={() => openProfile(group.targetUserId)}
          />
          <Card.Row
            title="Панель управления пользователем"
            subtitle="Бан, счётчики, сессии, IP"
            onClick={() => openAdminCard(group.targetUserId)}
          />
        </Card>

        <Card caption={`Жалобы (${group.reports.length})`}>
          {group.reports.map((report) => (
            <div
              key={report.id}
              ref={(node) => {
                if (node) rowRefs.current.set(report.id, node);
                else rowRefs.current.delete(report.id);
              }}
            >
              <Card.Row
                title={`@${report.reporterUsername}`}
                subtitle={
                  report.targetMessageId != null
                    ? `«${report.comment}» · сообщение #${report.targetMessageId}`
                    : `«${report.comment}»`
                }
                value={formatDateTime(report.createdAt)}
                onClick={() => openReportMenu(report.id)}
                chevron={false}
              />
              {expanded.includes(report.id) && (
                <div className={styles.reportText}>
                  <p className={styles.reportComment}>{report.comment}</p>
                  <p className={styles.reportMeta}>
                    {`@${report.reporterUsername} · ${formatDateTime(report.createdAt)}`}
                    {report.targetMessageId != null ? ` · сообщение #${report.targetMessageId}` : ''}
                  </p>
                </div>
              )}
            </div>
          ))}
        </Card>

        {view === 'closed' ? (
          <Card caption="Решение">
            <Card.Row
              title={group.resolution ?? '—'}
              subtitle={group.closedAt ? formatDateTime(group.closedAt) : undefined}
            />
          </Card>
        ) : closedNow ? (
          <Card caption="Разбор">
            <Card.Row title="Жалоба закрыта" subtitle={closedNow} />
          </Card>
        ) : (
          <Card caption="Разбор">
            {group.hasNew && !workedNow && (
              <Card.Row title="Взять в работу" onClick={!busy ? () => void handleWork() : undefined} chevron={false} />
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

      {menuFor && (
        <Menu
          anchor={menuFor.anchor}
          onClose={() => setMenuFor(null)}
          items={[
            {
              id: 'profile',
              label: 'Профиль жалобщика',
              icon: 'user',
              onSelect: () => {
                const report = group.reports.find((item) => item.id === menuFor.reportId);
                if (report) openProfile(report.reporterId);
              },
            },
            {
              id: 'text',
              label: expanded.includes(menuFor.reportId) ? 'Скрыть текст жалобы' : 'Текст жалобы',
              icon: 'report',
              onSelect: () => toggleReportText(menuFor.reportId),
            },
          ]}
        />
      )}
    </Sheet>
  );
}
