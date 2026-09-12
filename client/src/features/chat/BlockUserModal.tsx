import { useState } from 'react';

import { ApiError } from '../../api/client';
import { useChatStore } from '../../stores/chatStore';
import { Modal } from '../groups/Modal';
import styles from './BlockUserModal.module.css';

interface BlockUserModalProps {
  chatId: string;
  userId: string;
  username: string;
  onClose: () => void;
}

export function BlockUserModal({ chatId, userId, username, onClose }: BlockUserModalProps) {
  const setUserBlocked = useChatStore((s) => s.setUserBlocked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBlock(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await setUserBlocked(chatId, userId, true);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось заблокировать');
      setPending(false);
    }
  }

  return (
    <Modal title="Заблокировать?" onClose={onClose}>
      <p className={styles.text}>
        Писать и звонить друг другу не сможет никто из вас: ни @{username} вам, ни вы ему. Переписка остаётся на
        месте, и блокировку можно снять.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button className={styles.cancelButton} type="button" onClick={onClose} disabled={pending}>
          Отмена
        </button>
        <button className={styles.blockButton} type="button" onClick={() => void handleBlock()} disabled={pending}>
          Заблокировать
        </button>
      </div>
    </Modal>
  );
}
