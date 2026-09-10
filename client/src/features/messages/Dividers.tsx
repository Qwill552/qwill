import { formatDayLabel } from './dayLabel';
import styles from './Dividers.module.css';

export function DateDivider({ iso }: { iso: string }) {
  return (
    <div className={styles.dayWrap} data-day-divider="true">
      <span className={styles.day}>{formatDayLabel(iso)}</span>
    </div>
  );
}

export function FloatingDate({ iso, offset }: { iso: string | null; offset: number }) {
  return (
    <div
      className={`${styles.floating} ${iso === null ? styles.floatingHidden : ''}`}
      style={{ transform: `translateY(${offset}px)` }}
      aria-hidden="true"
    >
      <span className={styles.day}>{iso === null ? '' : formatDayLabel(iso)}</span>
    </div>
  );
}

/** Граница прочитанного. Ставится один раз при открытии чата и не переезжает,
 *  пока чат открыт, — иначе линия убегает от глаз по мере чтения. */
export function UnreadDivider({ count }: { count: number }) {
  return (
    <div className={styles.unread}>
      {count > 0 ? `Непрочитанные · ${count}` : 'Непрочитанные'}
    </div>
  );
}
