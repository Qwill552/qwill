import { useEffect, useRef } from 'react';

import styles from './Ripple.module.css';

/** Отклик на нажатие. Ставится последним ребёнком у интерактивного элемента; сам вешает
 *  слушатель на родителя, поэтому обёрток и проброса обработчиков не требует.
 *  Родителю нужны `position: relative` — размытия и теней здесь нет, только currentColor. */
export function Ripple() {
  const layerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;

    // prefers-reduced-motion гасит анимацию токеном, но круг без анимации остался бы висеть.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    function spawn(event: PointerEvent): void {
      if (!layer || !host || reduced.matches) return;
      const rect = host.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      const drop = document.createElement('span');
      drop.className = styles.drop ?? '';
      drop.style.width = `${size}px`;
      drop.style.height = `${size}px`;
      drop.style.left = `${event.clientX - rect.left - size / 2}px`;
      drop.style.top = `${event.clientY - rect.top - size / 2}px`;
      drop.addEventListener('animationend', () => drop.remove());
      layer.append(drop);
    }

    host.addEventListener('pointerdown', spawn);
    return () => host.removeEventListener('pointerdown', spawn);
  }, []);

  return <span ref={layerRef} className={styles.layer} aria-hidden="true" />;
}
