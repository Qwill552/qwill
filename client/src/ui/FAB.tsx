import { Icon, type IconName } from './Icon';
import styles from './FAB.module.css';

interface FABProps {
  icon: IconName;
  label: string;
  onClick: () => void;
}

/** Круглая кнопка действия справа снизу, над таб-баром. */
export function FAB({ icon, label, onClick }: FABProps) {
  return (
    <button type="button" className={styles.fab} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={20} />
    </button>
  );
}
