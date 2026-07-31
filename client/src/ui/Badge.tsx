import styles from './Badge.module.css';

interface BadgeProps {
  count: number;
  /** Замьюченный чат: счётчик показывается, но нейтральным цветом. */
  muted?: boolean;
  className?: string;
}

/** Счётчик непрочитанных. Ноль не рисуется вовсе, трёхзначное схлопывается в 99+. */
export function Badge({ count, muted, className }: BadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={`${styles.badge} ${muted ? styles.muted : ''} ${className ?? ''}`}
      aria-label={`Непрочитанных: ${count}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
