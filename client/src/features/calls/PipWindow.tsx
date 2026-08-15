import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { Icon } from '../../ui/Icon';
import { haptic } from '../../ui/haptic';
import styles from './PipWindow.module.css';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const TAP_MOVE_THRESHOLD_PX = 8;
const VELOCITY_SMOOTHING = 0.7;
const STALE_VELOCITY_MS = 80;
const FLING_PROJECTION_MS = 140;
const SETTLE_MIN_MS = 160;
const SETTLE_MAX_MS = 420;
const SETTLE_BASE_SPEED = 1.2;
const SETTLE_SPEED_WEIGHT = 0.6;

interface Point {
  x: number;
  y: number;
}

function readTranslate(element: HTMLElement): Point {
  const { transform } = getComputedStyle(element);
  if (!transform || transform === 'none') return { x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.m41, y: matrix.m42 };
}

function cornerFor(centerX: number, centerY: number): Corner {
  const isRight = centerX > window.innerWidth / 2;
  const isBottom = centerY > window.innerHeight / 2;
  if (isBottom) return isRight ? 'bottom-right' : 'bottom-left';
  return isRight ? 'top-right' : 'top-left';
}

function settleDuration(distance: number, speed: number): number {
  const raw = distance / (speed * SETTLE_SPEED_WEIGHT + SETTLE_BASE_SPEED);
  return Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, raw));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface PipWindowProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  label: string;
  corner?: Corner;
  mirrored: boolean;
  showFlipHint?: boolean;
  onTap: () => void;
}

export function PipWindow({ videoRef, label, corner = 'top-right', mirrored, showFlipHint = false, onTap }: PipWindowProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    velocityX: 0,
    velocityY: 0,
  });

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const element = wrapRef.current;
    if (!element) return;
    element.setPointerCapture(event.pointerId);
    const base = readTranslate(element);
    element.style.transition = 'none';
    element.style.transform = `translate3d(${base.x}px, ${base.y}px, 0)`;
    gestureRef.current = {
      dragging: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      baseX: base.x,
      baseY: base.y,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
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

    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) {
      const instantX = (event.clientX - gesture.lastX) / elapsed;
      const instantY = (event.clientY - gesture.lastY) / elapsed;
      gesture.velocityX = gesture.velocityX * (1 - VELOCITY_SMOOTHING) + instantX * VELOCITY_SMOOTHING;
      gesture.velocityY = gesture.velocityY * (1 - VELOCITY_SMOOTHING) + instantY * VELOCITY_SMOOTHING;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.lastTime = event.timeStamp;
    }

    element.style.transform = `translate3d(${gesture.baseX + dx}px, ${gesture.baseY + dy}px, 0)`;
  }

  function settleToCorner(element: HTMLDivElement, velocityX: number, velocityY: number): void {
    const released = element.getBoundingClientRect();
    const nextCorner = cornerFor(
      released.left + released.width / 2 + velocityX * FLING_PROJECTION_MS,
      released.top + released.height / 2 + velocityY * FLING_PROJECTION_MS,
    );

    element.style.transition = 'none';
    element.style.transform = '';
    element.dataset.corner = nextCorner;

    const anchored = element.getBoundingClientRect();
    const dx = released.left - anchored.left;
    const dy = released.top - anchored.top;
    const distance = Math.hypot(dx, dy);
    if (distance < 1 || prefersReducedMotion()) return;

    element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    void element.offsetWidth;
    element.style.transition = `transform ${settleDuration(distance, Math.hypot(velocityX, velocityY))}ms var(--ease-spring)`;
    element.style.transform = 'translate3d(0, 0, 0)';
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

    const stale = event.timeStamp - gesture.lastTime > STALE_VELOCITY_MS;
    settleToCorner(element, stale ? 0 : gesture.velocityX, stale ? 0 : gesture.velocityY);
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
      <video ref={videoRef} autoPlay playsInline muted className={`${styles.video} ${mirrored ? styles.mirrored : ''}`} />
      {showFlipHint && <Icon name="camera-flip" size={16} className={styles.flipHint} />}
    </div>
  );
}
