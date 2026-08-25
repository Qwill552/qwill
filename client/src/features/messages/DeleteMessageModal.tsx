import { Modal } from '../groups/Modal';
import styles from './DeleteMessageModal.module.css';

interface DeleteMessageModalProps {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteMessageModal({ count, onCancel, onConfirm }: DeleteMessageModalProps) {
  return (
    <Modal title={count > 1 ? 'Удалить сообщения?' : 'Удалить это сообщение?'} onClose={onCancel}>
      <div className={styles.actions}>
        <button className={styles.cancelButton} type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className={styles.deleteButton} type="button" onClick={onConfirm}>
          Удалить
        </button>
      </div>
    </Modal>
  );
}
