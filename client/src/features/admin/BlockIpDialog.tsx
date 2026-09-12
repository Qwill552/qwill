import { IP_BAN_DEFAULT_DAYS, IP_BAN_DURATION_DAYS, type IpBanDurationDays } from '@messenger/shared';
import { useState } from 'react';

import { createIpBanRequest } from '../../api/admin';
import { Modal } from '../groups/Modal';
import { durationLabel } from './ipBanFormat';
import styles from './BlockIpDialog.module.css';

interface BlockIpDialogProps {
  address: string;
  onClose: () => void;
  onBlocked: (cidr: string) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось заблокировать';
}

export function BlockIpDialog({ address, onClose, onBlocked }: BlockIpDialogProps) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<IpBanDurationDays>(IP_BAN_DEFAULT_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(): void {
    const trimmed = reason.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    createIpBanRequest({ ip: address, subnet: false, reason: trimmed, days })
      .then((ban) => {
        onBlocked(ban.cidr);
        onClose();
      })
      .catch((err: unknown) => {
        setError(errorText(err));
        setBusy(false);
      });
  }

  return (
    <Modal title={`Заблокировать ${address}`} onClose={onClose} className={styles.overlay} opaque>
      <p className={styles.hint}>Блокируется только этот адрес, подсеть не затрагивается.</p>

      <label className={styles.label} htmlFor="block-ip-reason">
        Причина
      </label>
      <input
        id="block-ip-reason"
        className={styles.input}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Для чего закрывается доступ"
        disabled={busy}
      />

      <label className={styles.label} htmlFor="block-ip-days">
        Срок
      </label>
      <select
        id="block-ip-days"
        className={styles.input}
        value={days === null ? 'forever' : String(days)}
        onChange={(event) =>
          setDays(event.target.value === 'forever' ? null : (Number(event.target.value) as IpBanDurationDays))
        }
        disabled={busy}
      >
        {IP_BAN_DURATION_DAYS.map((value) => (
          <option key={value === null ? 'forever' : value} value={value === null ? 'forever' : String(value)}>
            {durationLabel(value)}
          </option>
        ))}
      </select>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onClose} disabled={busy}>
          Отмена
        </button>
        <button
          type="button"
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={busy || !reason.trim()}
        >
          Заблокировать
        </button>
      </div>
    </Modal>
  );
}
