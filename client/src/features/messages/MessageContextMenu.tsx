import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useBackHandler } from '../../app/useBackHandler';
import { Icon, type IconName } from '../../ui/Icon';
import { ReactionPicker } from './ReactionPicker';
import styles from './MessageContextMenu.module.css';

export interface MessageMenuItem {
  id: string;
  icon: IconName;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

interface MessageContextMenuProps {
  /** Прямоугольник самого пузыря (не всей строки) — по нему клон встаёт след в след. */
  anchorRect: DOMRect;
  bubble: ReactNode;
  own: boolean;
  /** «✓✓ прочитано в 20:10» и подобное — null для чужих сообщений (ux-ui/06, секция 2). */
  statusLabel: string | null;
  myReactions: ReadonlySet<string>;
  onReact: (emoji: string) => void;
  onExpandReactions: () => void;
  /** Панель реакций скрыта — в чате с объявлениями реагировать не на кого. */
  reactable: boolean;
  items: MessageMenuItem[];
  onClose: () => void;
}

const GAP = 8;
const EDGE = 12;

/**
 * Контекстное меню сообщения (ux-ui/06-message-interaction.md, секция 2): фон размывается
 * скримом, тапнутый пузырь — резкий клон в портале поверх него (scale 1.03). Панель реакций
 * и список пунктов раскрываются в сторону, где больше места, и прижаты к тому краю экрана,
 * к какому прижат сам пузырь (свои — справа, чужие — слева).
 */
export function MessageContextMenu({
  anchorRect,
  bubble,
  own,
  statusLabel,
  myReactions,
  onReact,
  onExpandReactions,
  reactable,
  items,
  onClose,
}: MessageContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ visibility: 'hidden', top: 0, left: 0 });
  // Появление 200 мс / закрытие 160 мс (ux-ui/06, секция 2) — те же токены, что у Sheet.tsx:
  // сперва проигрывается exit-анимация, реальный unmount (onClose) — по её окончании.
  const [closing, setClosing] = useState(false);

  function startClose(): void {
    setClosing((current) => current || true);
  }

  useEffect(() => {
    if (!closing) return;
    const ms = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-close')) || 0;
    const timer = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  // Кнопка/жест «назад» закрывает меню раньше, чем уходит из чата (ux-ui/06, «Готово когда»).
  useBackHandler(!closing, startClose);

  // Позиция считается после отрисовки, когда известны реальные размеры панели, но до кадра
  // (тот же приём, что в Menu.tsx) — иначе панель дёрнется от начальных 0/0 к месту.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const { offsetHeight: height, offsetWidth: width } = panel;
    const { innerWidth: vw, innerHeight: vh } = window;

    const spaceBelow = vh - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const dropUp = spaceBelow < height + GAP + EDGE && spaceAbove > spaceBelow;
    const top = dropUp
      ? Math.max(EDGE, anchorRect.top - height - GAP)
      : Math.min(anchorRect.bottom + GAP, vh - height - EDGE);

    // Своя строка прижата к правому краю экрана, чужая — к левому: панель растёт от того же края.
    const left = own
      ? Math.max(EDGE, Math.min(anchorRect.right - width, vw - width - EDGE))
      : Math.max(EDGE, Math.min(anchorRect.left, vw - width - EDGE));

    setPanelStyle({
      top,
      left,
      ['--menu-origin' as string]: `${dropUp ? 'bottom' : 'top'} ${own ? 'right' : 'left'}`,
    });
  }, [anchorRect, own]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') startClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // React порталит DOM-узлы в document.body, но синтетические события всё равно всплывают
  // по ДЕРЕВУ React, а не по DOM: этот компонент — JSX-ребёнок MessageRow, у которой на
  // корне висят обработчики жестов (long-press/tap/swipe). Без остановки всплытия тап по
  // кнопке меню или по скриму долетал бы до MessageRow как «новый тап» и через 250 мс
  // открывал бы то же меню заново — см. журнал ux-ui.md, этап 6.
  function stopPointerBubble(event: React.PointerEvent): void {
    event.stopPropagation();
  }

  return createPortal(
    <div
      onPointerDown={stopPointerBubble}
      onPointerMove={stopPointerBubble}
      onPointerUp={stopPointerBubble}
      onPointerCancel={stopPointerBubble}
    >
      <div
        className={`${styles.scrim} ${closing ? styles.scrimClosing : ''}`}
        onClick={startClose}
        aria-hidden="true"
      />

      <div
        className={`${styles.bubbleClone} ${closing ? styles.bubbleCloneClosing : ''}`}
        style={{ top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height }}
        aria-hidden="true"
      >
        {bubble}
      </div>

      <div ref={panelRef} className={`${styles.panel} ${closing ? styles.panelClosing : ''}`} style={panelStyle}>
        {reactable && (
          <ReactionPicker
            myReactions={myReactions}
            onReact={(emoji) => {
              onReact(emoji);
              startClose();
            }}
            onExpand={() => {
              onExpandReactions();
              startClose();
            }}
          />
        )}

        <div className={styles.list} role="menu">
          {statusLabel && <div className={styles.status}>{statusLabel}</div>}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`${styles.item} ${item.danger ? styles.danger : ''}`}
              onClick={() => {
                item.onSelect();
                startClose();
              }}
            >
              <Icon name={item.icon} size={22} className={styles.glyph} />
              <span className={styles.label}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
