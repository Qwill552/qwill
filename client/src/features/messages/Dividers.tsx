import { formatDayLabel } from './dayLabel';
import styles from './Dividers.module.css';

export function DateDivider({
  iso,
  covered,
  onOpenCalendar,
}: {
  iso: string;
  covered?: boolean;
  onOpenCalendar?: (iso: string) => void;
}) {
  return (
    <div
      className={`${styles.dayWrap} ${covered ? styles.dayCovered : ''}`}
      data-day-divider="true"
      aria-hidden={covered ? 'true' : undefined}
    >
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
  ref,
  iso,
  hidden,
  onJumpToDay,
}: {
  ref: React.Ref<HTMLDivElement>;
  iso: string | null;
  hidden: boolean;
  onJumpToDay?: (iso: string) => void;
}) {
  const label = iso === null ? '' : formatDayLabel(iso);
  const interactive = onJumpToDay !== undefined && iso !== null;
  const away = iso === null || hidden;

  return (
    <div
      ref={ref}
      className={`${styles.floating} ${away ? styles.floatingHidden : ''}`}
      aria-hidden={interactive && !away ? undefined : 'true'}
    >
      {interactive ? (
        <button
          type="button"
          className={`${styles.day} ${styles.dayButton}`}
          aria-label={`К началу дня, ${label}`}
          tabIndex={away ? -1 : 0}
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
