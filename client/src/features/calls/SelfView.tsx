import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { useParticipantVideo } from '../../calls/useParticipantVideo';
import { useAuthStore } from '../../stores/authStore';
import { haptic } from '../../ui/haptic';
import styles from './SelfView.module.css';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const TAP_MOVE_THRESHOLD_PX = 8;

function nearestCorner(rect: DOMRect, containerWidth: number, containerHeight: number): Corner {
  const isRight = rect.left + rect.width / 2 > containerWidth / 2;
  const isBottom = rect.top + rect.height / 2 > containerHeight / 2;
  if (isBottom) return isRight ? 'bottom-right' : 'bottom-left';
  return isRight ? 'top-right' : 'top-left';
}

export function SelfView() {
  const myId = useAuthStore((s) => s.user?.id) ?? '';
  const videoRef = useParticipantVideo(myId, true);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef({ dragging: false, startX: 0, startY: 0, originLeft: 0, originTop: 0, moved: false });
  const [collapsed, setCollapsed] = useState(false);

  function toggleCollapsed(): void {
    haptic();
    setCollapsed((value) => !value);
  }

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
      toggleCollapsed();
      return;
    }

    const container = element.parentElement;
    const corner = container
      ? nearestCorner(element.getBoundingClientRect(), container.clientWidth, container.clientHeight)
      : 'top-right';
    element.style.left = '';
    element.style.top = '';
    element.style.right = '';
    element.style.bottom = '';
    element.setAttribute('data-corner', corner);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleCollapsed();
  }

  return (
    <div
      ref={wrapRef}
      className={`${styles.selfView} ${collapsed ? styles.collapsed : ''}`}
      data-corner="top-right"
      role="button"
      tabIndex={0}
      aria-label={collapsed ? 'Своё видео свёрнуто, нажмите чтобы развернуть' : 'Своё видео, нажмите чтобы свернуть'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
    </div>
  );
}
