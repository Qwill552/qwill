import { useMemo } from 'react';

import styles from './LockScreen.module.css';

const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function LockScreen() {
  const now = useMemo(() => new Date(), []);

  return (
    <div className={styles.lock}>
      <p className={styles.time}>{TIME_FORMAT.format(now)}</p>
      <p className={styles.date}>{DATE_FORMAT.format(now)}</p>
    </div>
  );
}
