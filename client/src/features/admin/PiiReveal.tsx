import { ADMIN_PII_REVEAL_MS, type AdminPiiDto } from '@messenger/shared';
import { useEffect, useRef, useState } from 'react';

import { revealAdminUserPiiRequest } from '../../api/admin';
import { Card } from '../../ui/Card';
import styles from './PiiReveal.module.css';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось получить данные';
}

interface PiiRevealProps {
  userId: string;
}

/** IP и User-Agent не показываются в карточке — только по кнопке, с автоскрытием через
 *  60 секунд и записью в журнал при каждом нажатии (R-32B). Уход с карточки (смена userId
 *  или размонтирование) тоже скрывает показанное — это не эффект таймера, а прямое условие
 *  ТЗ «через 60 секунд или при уходе с карточки». */
export function PiiReveal({ userId }: PiiRevealProps) {
  const [pii, setPii] = useState<AdminPiiDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hideTimer = useRef<number | null>(null);

  function clearHideTimer(): void {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  useEffect(() => {
    setPii(null);
    setError(null);
    clearHideTimer();
    return clearHideTimer;
  }, [userId]);

  function handleReveal(): void {
    setBusy(true);
    setError(null);
    revealAdminUserPiiRequest(userId)
      .then((result) => {
        setPii(result);
        clearHideTimer();
        hideTimer.current = window.setTimeout(() => setPii(null), ADMIN_PII_REVEAL_MS);
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false));
  }

  return (
    <Card caption="IP и устройства">
      {!pii ? (
        <Card.Row
          title="Скрыто"
          subtitle="Показывается по требованию, каждое нажатие — строка в журнале"
          trailing={
            <button type="button" className={styles.button} onClick={handleReveal} disabled={busy}>
              Показать
            </button>
          }
        />
      ) : (
        <>
          <Card.Row title="IP при регистрации" value={pii.signupIp ?? 'нет данных'} />
          <Card.Row title="Устройство при регистрации" value={pii.signupUserAgent ?? 'нет данных'} />
          {pii.sessions.length === 0 ? (
            <Card.Row title="Сессии" subtitle="Активных сессий нет" />
          ) : (
            pii.sessions.map((session) => (
              <Card.Row
                key={session.id}
                title={session.lastSeenIp ?? session.ip ?? 'нет данных'}
                subtitle={session.userAgent ?? 'нет данных'}
                value={formatDateTime(session.createdAt)}
              />
            ))
          )}
        </>
      )}
      {error && <Card.Row title="Ошибка" subtitle={error} danger />}
    </Card>
  );
}
