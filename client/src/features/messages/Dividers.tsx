import { formatDayLabel } from './dayLabel';
import styles from './Dividers.module.css';

/** Липкая пилюля с датой: висит над лентой, пока идут сообщения этого дня. */
export function DateDivider({ iso }: { iso: string }) {
  return (
    <div className={styles.dayWrap}>
      <span className={styles.day}>{formatDayLabel(iso)}</span>
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
