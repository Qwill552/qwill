import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { desktopOverlayBounds } from '../../app/desktopOverlay';
import styles from './CardSizeHint.module.css';

const GAP = 8;
const EDGE = 12;

export function CardSizeHint() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!anchor || !popover) return;

    const { offsetWidth: width, offsetHeight: height } = popover;
    const bounds = desktopOverlayBounds(anchor);
    const minX = bounds ? bounds.left : 0;
    const maxX = bounds ? bounds.right : window.innerWidth;
    const minY = bounds ? bounds.top : 0;
    const maxY = bounds ? bounds.bottom : window.innerHeight;

    const spaceAbove = anchor.top - minY;
    const dropUp = spaceAbove > height + GAP + EDGE;

    setStyle({
      top: dropUp
        ? Math.max(minY + EDGE, anchor.top - height - GAP)
        : Math.min(anchor.bottom + GAP, maxY - height - EDGE),
      left: Math.min(Math.max(minX + EDGE, anchor.left), maxX - width - EDGE),
    });
  }, [anchor]);

  function open(): void {
    setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-label="Под какие размеры делать визитку"
        aria-expanded={anchor !== null}
        onClick={() => (anchor ? setAnchor(null) : open())}
        onMouseEnter={open}
        onMouseLeave={() => setAnchor(null)}
        onFocus={open}
        onBlur={() => setAnchor(null)}
      >
        ?
      </button>

      {anchor &&
        createPortal(
          <div ref={popoverRef} className={styles.popover} style={style} role="tooltip">
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
          </div>,
          document.body,
        )}
    </>
  );
}
