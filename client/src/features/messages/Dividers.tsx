import type { Ref } from 'react';

import { formatDayLabel } from './dayLabel';
import styles from './Dividers.module.css';

/** Липкая пилюля с датой: одна на всю ленту, текст меняется на текущий день по скроллу. */
export function DateDivider({ iso, pillRef }: { iso: string; pillRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={pillRef} className={styles.dayWrap}>
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
