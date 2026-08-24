import type { AvatarColor } from '@messenger/shared';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useEscapeKey } from '../app/hotkeys';
import { useBackHandler } from '../app/useBackHandler';
import { desktopOverlayBounds } from '../app/desktopOverlay';
import { registerMenuOpen, unregisterMenuOpen } from '../app/menuCoordinator';
import { Avatar } from './Avatar';
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
  /** Разделитель сразу перед этим пунктом — начинает новую группу. */
  dividerBefore?: boolean;
  /** Свой элемент справа (например, Switch) — клик по нему не всплывает до строки, чтобы не
   *  переключать состояние дважды (ux-ui/14-desktop/04-main-menu.md, «Пункт с переключателем»). */
  trailing?: ReactNode;
  onSelect: (event: MouseEvent<HTMLElement>) => void;
}

export interface MenuHeader {
  avatarUrl?: string | null;
  avatarColor?: AvatarColor;
  label: string;
  username?: string;
  onSelect: () => void;
}

interface MenuProps {
  /** Прямоугольник элемента, от которого раскрывается меню — обычно getBoundingClientRect() кнопки. */
  anchor: DOMRect;
  items: MenuItem[];
  onClose: () => void;
  /** Шапка меню — аватар, имя, @username (☰-меню на десктопе). */
  header?: MenuHeader;
  /** Фиксированная ширина поповера на десктопе (px) — на мобильной ветке не действует,
   *  там ширина по-прежнему считается от содержимого (ux-ui/14-desktop/04-main-menu.md). */
  desktopWidth?: number;
}

/** Зазор между якорем и меню и минимальный отступ от краёв экрана. */
const GAP = 6;
const EDGE = 8;

/** Всплывающее меню: само решает, раскрыться вверх или вниз, влево или вправо —
 *  по тому, сколько места осталось до края экрана. Фон размывается, а не затемняется:
 *  в строгом режиме то же самое делает токен --scrim-*.
 *
 *  Закрывается с exit-анимацией и участвует в истории через useBackHandler — тот же приём,
 *  что у Sheet.tsx и MessageContextMenu.tsx (ux-ui/14-desktop/04-main-menu.md, «Заодно
 *  закрыть два пробела Menu»): раньше меню размонтировалось мгновенно и не отвечало на
 *  аппаратную кнопку «назад». Плюс глобальная эксклюзивность — на десктопе обе колонки
 *  смонтированы одновременно, и без координатора ☰-меню и меню чата могли быть открыты разом. */
export function Menu({ anchor, items, onClose, header, desktopWidth }: MenuProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({
    visibility: 'hidden',
    top: 0,
    left: 0,
    ...(desktopWidth ? { ['--menu-desktop-w' as string]: `${desktopWidth}px` } : undefined),
  });

  const startClose = useCallback(() => {
    setClosing((current) => current || true);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const ms = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-close')) || 0;
    const timer = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  useBackHandler(!closing, startClose);
  useEscapeKey(!closing, startClose);

  useEffect(() => {
    registerMenuOpen(menuId, startClose);
    return () => unregisterMenuOpen(menuId);
  }, [menuId, startClose]);

  // Позиция считается после отрисовки, когда известны реальные размеры меню, но до кадра — иначе дёрнется.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { offsetWidth: width, offsetHeight: height } = menu;
    const bounds = desktopOverlayBounds(anchor);
    const minX = bounds ? bounds.left : 0;
    const maxX = bounds ? bounds.right : window.innerWidth;
    const minY = bounds ? bounds.top : 0;
    const maxY = bounds ? bounds.bottom : window.innerHeight;

    const spaceBelow = maxY - anchor.bottom;
    const spaceAbove = anchor.top - minY;
    const dropUp = spaceBelow < height + GAP + EDGE && spaceAbove > spaceBelow;
    const top = dropUp
      ? Math.max(minY + EDGE, anchor.top - height - GAP)
      : Math.min(anchor.bottom + GAP, maxY - height - EDGE);

    const openLeft = anchor.left + width + EDGE > maxX;
    const left = openLeft
      ? Math.max(minX + EDGE, anchor.right - width)
      : Math.min(anchor.left, maxX - width - EDGE);

    setStyle({
      top,
      left,
      ['--menu-origin' as string]: `${dropUp ? 'bottom' : 'top'} ${openLeft ? 'right' : 'left'}`,
      ...(desktopWidth ? { ['--menu-desktop-w' as string]: `${desktopWidth}px` } : undefined),
    });
  }, [anchor, desktopWidth]);


  function select(item: MenuItem, event: MouseEvent<HTMLElement>): void {
    item.onSelect(event);
    if (!item.keepOpen) startClose();
  }

  function selectHeader(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
    header?.onSelect();
    startClose();
  }

  return createPortal(
    <>
      <div className={`${styles.scrim} ${closing ? styles.scrimClosing : ''}`} onClick={startClose} aria-hidden="true" />
      <div
        ref={menuRef}
        className={`${styles.menu} ${closing ? styles.menuClosing : ''}`}
        style={style}
        role="menu"
      >
        {header && (
          <button type="button" role="menuitem" className={styles.header} onClick={selectHeader}>
            <Avatar label={header.label} avatarUrl={header.avatarUrl} color={header.avatarColor} size={44} />
            <span className={styles.headerBody}>
              <span className={styles.headerName}>{header.label}</span>
              {header.username && <span className={styles.headerUsername}>@{header.username}</span>}
            </span>
          </button>
        )}

        {items.map((item) => (
          <div key={item.id} className={styles.group}>
            {item.dividerBefore && <div className={styles.divider} aria-hidden="true" />}
            {item.trailing ? (
              <div
                role="menuitem"
                tabIndex={0}
                className={`${styles.item} ${item.danger ? styles.danger : ''} ${item.muted ? styles.muted : ''}`}
                onClick={(e) => select(item, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.currentTarget.click();
                  }
                }}
              >
                {item.icon && <Icon name={item.icon} size={22} className={styles.glyph} />}
                <span className={styles.label}>{item.label}</span>
                <span className={styles.trailingSlot} onClick={(e) => e.stopPropagation()}>
                  {item.trailing}
                </span>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                className={`${styles.item} ${item.danger ? styles.danger : ''} ${item.muted ? styles.muted : ''}`}
                onClick={(e) => select(item, e)}
              >
                {item.icon && <Icon name={item.icon} size={22} className={styles.glyph} />}
                <span className={styles.label}>{item.label}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
