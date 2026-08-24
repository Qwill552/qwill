import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

import { Icon, type IconName } from './Icon';
import styles from './Menu.module.css';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  /** Пункт приглушён — так показывается уже выключенное состояние, а не запрет нажатия. */
  muted?: boolean;
  /** Не закрывать меню после выбора — например, чтобы сравнить несколько состояний подряд,
   *  не открывая меню заново каждый раз. */
  keepOpen?: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
}

interface MenuProps {
  /** Прямоугольник элемента, от которого раскрывается меню — обычно getBoundingClientRect() кнопки. */
  anchor: DOMRect;
  items: MenuItem[];
  onClose: () => void;
  /** Фиксированная ширина поповера на десктопе (px) — на мобильной ветке не действует,
   *  там ширина по-прежнему считается от содержимого (ux-ui/14-desktop/04-main-menu.md). */
  desktopWidth?: number;
}

/** Зазор между якорем и меню и минимальный отступ от краёв экрана. */
const GAP = 6;
const EDGE = 8;

/** Всплывающее меню: само решает, раскрыться вверх или вниз, влево или вправо —
 *  по тому, сколько места осталось до края экрана. Фон размывается, а не затемняется:
 *  в строгом режиме то же самое делает токен --scrim-*. */
export function Menu({ anchor, items, onClose, desktopWidth }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    visibility: 'hidden',
    top: 0,
    left: 0,
    ...(desktopWidth ? { ['--menu-desktop-w' as string]: `${desktopWidth}px` } : undefined),
  });

  // Позиция считается после отрисовки, когда известны реальные размеры меню, но до кадра — иначе дёрнется.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { offsetWidth: width, offsetHeight: height } = menu;
    const { innerWidth: vw, innerHeight: vh } = window;

    const spaceBelow = vh - anchor.bottom;
    const dropUp = spaceBelow < height + GAP + EDGE && anchor.top > spaceBelow;
    const top = dropUp ? Math.max(EDGE, anchor.top - height - GAP) : Math.min(anchor.bottom + GAP, vh - height - EDGE);

    const openLeft = anchor.left + width + EDGE > vw;
    const left = openLeft ? Math.max(EDGE, anchor.right - width) : Math.min(anchor.left, vw - width - EDGE);

    setStyle({
      top,
      left,
      ['--menu-origin' as string]: `${dropUp ? 'bottom' : 'top'} ${openLeft ? 'right' : 'left'}`,
      ...(desktopWidth ? { ['--menu-desktop-w' as string]: `${desktopWidth}px` } : undefined),
    });
  }, [anchor, desktopWidth]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div ref={menuRef} className={styles.menu} style={style} role="menu">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`${styles.item} ${item.danger ? styles.danger : ''} ${item.muted ? styles.muted : ''}`}
            onClick={(e) => {
              item.onSelect(e);
              if (!item.keepOpen) onClose();
            }}
          >
            {item.icon && <Icon name={item.icon} size={22} className={styles.glyph} />}
            <span className={styles.label}>{item.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
