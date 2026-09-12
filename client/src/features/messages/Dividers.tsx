import { formatDayLabel } from './dayLabel';
import styles from './Dividers.module.css';

export function DateDivider({ iso, onOpenCalendar }: { iso: string; onOpenCalendar?: (iso: string) => void }) {
  return (
    <div className={styles.dayWrap} data-day-divider="true">
      {onOpenCalendar ? (
        <button
          type="button"
          className={`${styles.day} ${styles.dayButton}`}
          aria-label={`Календарь, ${formatDayLabel(iso)}`}
          onClick={() => onOpenCalendar(iso)}
        >
          {formatDayLabel(iso)}
        </button>
      ) : (
        <span className={styles.day}>{formatDayLabel(iso)}</span>
      )}
    </div>
  );
}

export function FloatingDate({
  iso,
  offset,
  onJumpToDay,
}: {
  iso: string | null;
  offset: number;
  onJumpToDay?: (iso: string) => void;
}) {
  const label = iso === null ? '' : formatDayLabel(iso);
  const interactive = onJumpToDay !== undefined && iso !== null;

  return (
    <div
      className={`${styles.floating} ${iso === null ? styles.floatingHidden : ''}`}
      style={{ transform: `translateY(${offset}px)` }}
      aria-hidden={interactive ? undefined : 'true'}
    >
      {interactive ? (
        <button
          type="button"
          className={`${styles.day} ${styles.dayButton}`}
          aria-label={`К началу дня, ${label}`}
          onClick={() => onJumpToDay(iso)}
        >
          {label}
        </button>
      ) : (
        <span className={styles.day}>{label}</span>
      )}
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
