import styles from './Chip.module.css';

interface ChipProps {
  label: string;
  active?: boolean;
  /** Число справа от подписи. Ноль не рисуется. */
  count?: number;
  onClick?: () => void;
}

export function Chip({ label, active, count, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.active : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
      {count != null && count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  );
}
