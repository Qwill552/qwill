import {
  IP_BAN_DEFAULT_DAYS,
  IP_BAN_DURATION_DAYS,
  type AdminUserCardDto,
  type IpBanDurationDays,
} from '@messenger/shared';
import { useEffect, useState } from 'react';

import { banUserRequest, createIpBanRequest, revealAdminUserPiiRequest } from '../../api/admin';
import { Modal } from '../groups/Modal';
import { durationLabel } from './ipBanFormat';
import styles from './BanUserDialog.module.css';

interface BanUserDialogProps {
  userId: string;
  username: string;
  initialReason: string;
  onClose: () => void;
  onBanned: (user: AdminUserCardDto) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось заблокировать';
}

export function BanUserDialog({ userId, username, initialReason, onClose, onBanned }: BanUserDialogProps) {
  const [reason, setReason] = useState(initialReason);
  const [addresses, setAddresses] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState<IpBanDurationDays>(IP_BAN_DEFAULT_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    revealAdminUserPiiRequest(userId)
      .then((pii) => {
        if (cancelled) return;
        const known = new Set<string>();
        if (pii.signupIp) known.add(pii.signupIp);
        for (const session of pii.sessions) {
          if (session.ip) known.add(session.ip);
          if (session.lastSeenIp) known.add(session.lastSeenIp);
        }
        setAddresses([...known]);
      })
      .catch(() => {
        if (!cancelled) setAddresses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function toggle(address: string): void {
    setSelected((prev) =>
      prev.includes(address) ? prev.filter((item) => item !== address) : [...prev, address],
    );
  }

  async function handleSubmit(): Promise<void> {
    const trimmed = reason.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    try {
      const user = await banUserRequest(userId, trimmed);
      for (const address of selected) {
        await createIpBanRequest({ ip: address, subnet: false, reason: trimmed, days });
      }
      onBanned(user);
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Заблокировать @${username}`} onClose={onClose} opaque>
      <label className={styles.label} htmlFor="ban-dialog-reason">
        Причина
      </label>
      <input
        id="ban-dialog-reason"
        className={styles.input}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Нарушение правил"
        disabled={busy}
      />

      <p className={styles.caption}>Заблокировать также адреса</p>
      {addresses === null ? (
        <p className={styles.hint}>Загружаю адреса…</p>
      ) : addresses.length === 0 ? (
        <p className={styles.hint}>Адреса неизвестны</p>
      ) : (
        <>
          <ul className={styles.addresses}>
            {addresses.map((address) => (
              <li key={address}>
                <label className={styles.address}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selected.includes(address)}
                    onChange={() => toggle(address)}
                    disabled={busy}
                  />
                  <span>{address}</span>
                </label>
              </li>
            ))}
          </ul>

          {selected.length > 0 && (
            <>
              <label className={styles.label} htmlFor="ban-dialog-days">
                Срок блокировки адресов
              </label>
              <select
                id="ban-dialog-days"
                className={styles.input}
                value={days === null ? 'forever' : String(days)}
                onChange={(event) =>
                  setDays(
                    event.target.value === 'forever' ? null : (Number(event.target.value) as IpBanDurationDays),
                  )
                }
                disabled={busy}
              >
                {IP_BAN_DURATION_DAYS.map((value) => (
                  <option
                    key={value === null ? 'forever' : value}
                    value={value === null ? 'forever' : String(value)}
                  >
                    {durationLabel(value)}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onClose} disabled={busy}>
          Отмена
        </button>
        <button
          type="button"
          className={styles.submitButton}
          onClick={() => void handleSubmit()}
          disabled={busy || !reason.trim()}
        >
          Заблокировать
        </button>
      </div>
    </Modal>
  );
}
