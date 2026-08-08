import type { CSSProperties, ReactNode } from 'react';

import styles from './ChromeBar.module.css';

interface ChromeBarProps {
  side?: 'top' | 'bottom';
  children: ReactNode;
  className?: string;
  /** Точечный оверрайд геометрии инлайн-стилем — сильнее любого класса, не задевает
   *  других потребителей `.top`/`.bottom`. Нужен экранам, уже перенесённым на буквальные
   *  значения референса, где отступ не совпадает с токенами `--chrome-*` (ещё старой системы). */
  style?: CSSProperties;
}

/** Полоса плавающей хромы поверх контента. Контент экрана идёт во всю высоту и проезжает
 *  под ней — место под полосу берётся из `--chrome-space-top` / `--chrome-space-bottom`
 *  в padding контента, а не из высоты. Без этого стекло нечего размывать. */
export function ChromeBar({ side = 'top', children, className, style }: ChromeBarProps) {
  return (
    <div className={`${styles.bar} ${side === 'top' ? styles.top : styles.bottom} ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}
