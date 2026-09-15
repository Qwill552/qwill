import { useEffect, useState } from 'react';

import {
  closeDesktopWindow,
  getDesktopWindowMaximized,
  hasDesktopWindowControls,
  minimizeDesktopWindow,
  subscribeToDesktopWindowMaximized,
  toggleDesktopWindowMaximized,
} from '../native/desktop';
import styles from './DesktopTitleBar.module.css';

export function DesktopTitleBar() {
  const [maximized, setMaximized] = useState(false);
  const controls = hasDesktopWindowControls();

  useEffect(() => {
    if (!controls) return;

    let mounted = true;
    void getDesktopWindowMaximized().then((value) => {
      if (mounted) setMaximized(value);
    });
    const stop = subscribeToDesktopWindowMaximized((value) => setMaximized(value));

    return () => {
      mounted = false;
      stop();
    };
  }, [controls]);

  return (
    <div className={styles.bar}>
      {controls && (
        <div className={styles.controls}>
          <button type="button" className={styles.button} aria-label="Свернуть" onClick={minimizeDesktopWindow}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6h8" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>

          <button
            type="button"
            className={styles.button}
            aria-label={maximized ? 'Восстановить' : 'Развернуть'}
            onClick={toggleDesktopWindowMaximized}
          >
            {maximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 4.5h5v5h-5z" stroke="currentColor" strokeWidth="1" fill="none" />
                <path d="M4.5 4.5v-2h5v5h-2" stroke="currentColor" strokeWidth="1" fill="none" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 2.5h7v7h-7z" stroke="currentColor" strokeWidth="1" fill="none" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className={`${styles.button} ${styles.close}`}
            aria-label="Закрыть"
            onClick={closeDesktopWindow}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="m2.5 2.5 7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
