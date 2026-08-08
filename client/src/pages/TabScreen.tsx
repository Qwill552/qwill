import type { ReactNode } from 'react';

import styles from './TabScreen.module.css';

interface TabScreenProps {
  title: string;
  /** Кнопки справа от заголовка — уезжают вместе с ним. */
  actions?: ReactNode;
  /** Плавающие элементы поверх скроллера: FAB и подобное. */
  overlay?: ReactNode;
  children: ReactNode;
}

/** Каркас вкладки: скроллер во всю высоту с крупным заголовком в содержимом.
 *  Место под таб-бар берётся в padding — контент проезжает под ним. */
export function TabScreen({ title, actions, overlay, children }: TabScreenProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.scroller}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {actions}
        </div>
        {children}
      </div>
      {overlay}
    </div>
  );
}
