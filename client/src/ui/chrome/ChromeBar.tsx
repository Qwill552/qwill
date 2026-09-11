import type { CSSProperties, ReactNode, Ref } from 'react';

import styles from './ChromeBar.module.css';

interface ChromeBarProps {
  side?: 'top' | 'bottom';
  /** `chrome` — обычная плавающая полоса, заливку держат куски внутри. `solid` — сплошная
   *  непрозрачная полоса в потоке колонки (шапка чата на десктопе, ux-ui/14-desktop/03). */
  variant?: 'chrome' | 'solid';
  children: ReactNode;
  className?: string;
  /** Точечный оверрайд геометрии инлайн-стилем — сильнее любого класса, не задевает
   *  других потребителей `.top`/`.bottom`. Нужен экранам, уже перенесённым на буквальные
   *  значения референса, где отступ не совпадает с токенами `--chrome-*` (ещё старой системы). */
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

/** Полоса плавающей хромы поверх контента. Контент экрана идёт во всю высоту и проезжает
 *  под ней — место под полосу берётся из `--chrome-space-top` / `--chrome-space-bottom`
 *  в padding контента, а не из высоты. Без этого стекло нечего размывать. */
export function ChromeBar({ side = 'top', variant = 'chrome', children, className, style, ref }: ChromeBarProps) {
  return (
    <div
      ref={ref}
      className={`${styles.bar} ${side === 'top' ? styles.top : styles.bottom} ${variant === 'solid' ? styles.solid : ''} ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  );
}
