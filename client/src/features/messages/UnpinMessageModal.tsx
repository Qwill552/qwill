import { Modal } from '../groups/Modal';
import styles from './UnpinMessageModal.module.css';

interface UnpinMessageModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export function UnpinMessageModal({ onCancel, onConfirm }: UnpinMessageModalProps) {
  return (
    <Modal title="Открепить сообщение?" onClose={onCancel} className={styles.overlay}>
      <p className={styles.text}>Оно перестанет показываться сверху у всех в этом чате.</p>
      <div className={styles.actions}>
        <button className={styles.cancelButton} type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className={styles.confirmButton} type="button" onClick={onConfirm}>
          Открепить
        </button>
      </div>
    </Modal>
  );
}
