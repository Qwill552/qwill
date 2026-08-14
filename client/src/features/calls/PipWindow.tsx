import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { Icon } from '../../ui/Icon';
import { haptic } from '../../ui/haptic';
import styles from './PipWindow.module.css';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const TAP_MOVE_THRESHOLD_PX = 8;

function nearestCorner(rect: DOMRect): Corner {
  const isRight = rect.left + rect.width / 2 > window.innerWidth / 2;
  const isBottom = rect.top + rect.height / 2 > window.innerHeight / 2;
  if (isBottom) return isRight ? 'bottom-right' : 'bottom-left';
  return isRight ? 'top-right' : 'top-left';
}

interface PipWindowProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  label: string;
  corner?: Corner;
  showFlipHint?: boolean;
  onTap: () => void;
}

export function PipWindow({ videoRef, label, corner = 'top-right', showFlipHint = false, onTap }: PipWindowProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef({ dragging: false, startX: 0, startY: 0, originLeft: 0, originTop: 0, moved: false });

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const element = wrapRef.current;
    if (!element) return;
    element.setPointerCapture(event.pointerId);
    const rect = element.getBoundingClientRect();
    gestureRef.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const element = wrapRef.current;
    const gesture = gestureRef.current;
    if (!element || !gesture.dragging) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < TAP_MOVE_THRESHOLD_PX) return;
    if (!gesture.moved) {
      gesture.moved = true;
      element.dataset.dragging = 'true';
    }
    element.style.left = `${gesture.originLeft + dx}px`;
    element.style.top = `${gesture.originTop + dy}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const element = wrapRef.current;
    const gesture = gestureRef.current;
    if (!element) return;
    element.releasePointerCapture(event.pointerId);
    if (!gesture.dragging) return;
    gesture.dragging = false;
    delete element.dataset.dragging;

    if (!gesture.moved) {
      haptic();
      onTap();
      return;
    }

    const nextCorner = nearestCorner(element.getBoundingClientRect());
    element.style.left = '';
    element.style.top = '';
    element.style.right = '';
    element.style.bottom = '';
    element.setAttribute('data-corner', nextCorner);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    haptic();
    onTap();
  }

  return (
    <div
      ref={wrapRef}
      className={styles.pip}
      data-corner={corner}
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
      {showFlipHint && <Icon name="camera-flip" size={16} className={styles.flipHint} />}
    </div>
  );
}
