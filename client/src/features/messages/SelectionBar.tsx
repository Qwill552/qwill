import { Icon } from '../../ui/Icon';
import styles from './SelectionBar.module.css';

interface SelectionBarProps {
  /** Ответить осмысленно только для одного выбранного сообщения (ux-ui/06, секция 3). */
  canReply: boolean;
  onReply: () => void;
  onForward: () => void;
}

/** Панель «Ответить · Переслать» — занимает слот композера, пока открыт мультивыбор
 *  (ux-ui/06-message-interaction.md, секция 3). */
export function SelectionBar({ canReply, onReply, onForward }: SelectionBarProps) {
  return (
    <div className={styles.bar}>
      <button type="button" className={styles.action} onClick={onReply} disabled={!canReply}>
        <Icon name="reply" size={20} />
        Ответить
      </button>
      <button type="button" className={styles.action} onClick={onForward}>
        <Icon name="forward" size={20} />
        Переслать
      </button>
    </div>
  );
}
