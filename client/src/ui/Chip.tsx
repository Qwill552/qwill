import { Badge } from './Badge';
import styles from './Chip.module.css';

interface ChipProps {
  label: string;
  active?: boolean;
  /** Число справа от подписи. Ноль не рисуется. */
  count?: number;
  onClick?: () => void;
}

export function Chip({ label, active, count, onClick }: ChipProps) {
  const hasCount = count != null && count > 0;
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.active : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
      {hasCount && <span className={styles.count}>{count}</span>}
      {hasCount && (
        <span className={styles.tabBadge}>
          <Badge count={count as number} small className={styles.tabBadgeInner} />
        </span>
      )}
    </button>
  );
}
