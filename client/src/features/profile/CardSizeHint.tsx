import { useState } from 'react';

import styles from './CardSizeHint.module.css';

export function CardSizeHint() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={styles.button}
        aria-label="Под какие размеры делать визитку"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>

      {open && (
        <div className={styles.popover} role="tooltip">
          <p className={styles.title}>Размеры окна визитки</p>
          <p className={styles.line}>
            <span className={styles.label}>Высота</span>
            <span className={styles.value}>320 px везде</span>
          </p>
          <p className={styles.line}>
            <span className={styles.label}>Ширина на телефоне</span>
            <span className={styles.value}>300–410 px</span>
          </p>
          <p className={styles.line}>
            <span className={styles.label}>Ширина на компьютере</span>
            <span className={styles.value}>394–450 px</span>
          </p>
          <p className={styles.note}>
            Что не поместилось по высоте — прокручивается внутри окна. Задавайте размеры
            в процентах, а не в пикселях: тогда визитка сядет на любой экран.
          </p>
        </div>
      )}
    </div>
  );
}
