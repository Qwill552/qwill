import { GlassButton } from '../../ui/chrome/GlassButton';
import styles from './MediaSelectionBar.module.css';

interface MediaSelectionBarProps {
  count: number;
  canShowInChat: boolean;
  canDelete: boolean;
  onClose: () => void;
  onShowInChat: () => void;
  onForward: () => void;
  onDelete: () => void;
}

export function MediaSelectionBar({
  count,
  canShowInChat,
  canDelete,
  onClose,
  onShowInChat,
  onForward,
  onDelete,
}: MediaSelectionBarProps) {
  return (
    <div className={styles.bar} role="toolbar" aria-label="Режим выделения">
      <GlassButton icon="close" label="Выйти из выделения" variant="plain" onClick={onClose} />
      <span className={styles.count} aria-live="polite">
        {count}
      </span>
      <div className={styles.actions}>
        <GlassButton
          icon="eye"
          label="Показать в чате"
          variant="plain"
          disabled={!canShowInChat}
          onClick={onShowInChat}
        />
        <GlassButton icon="forward" label="Переслать" variant="plain" onClick={onForward} />
        <GlassButton
          icon="trash"
          label="Удалить"
          variant="plain"
          className={styles.danger}
          disabled={!canDelete}
          onClick={onDelete}
        />
      </div>
    </div>
  );
}
