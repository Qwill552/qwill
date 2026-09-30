import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { cssDurationMs } from '../motion';
import { haptic } from '../haptic';

interface SwipeActionOptions {
  threshold?: number;
  maxDrag?: number;
  onTrigger: () => void;
  disabled?: () => boolean;
}

const CSS_PX_PER_CM = 96 / 2.54;
export const SWIPE_START_PX = 0.4 * CSS_PX_PER_CM;
export const SWIPE_THRESHOLD_PX = 50;
export const SWIPE_LIMIT_PX = 80;
export const SWIPE_ICON_FROM_PX = 20;
export const SWIPE_ICON_SPAN_PX = 30;
const TAP_SLOP_PX = 10;
const RETURN_TOKEN = '--dur-swipe-return';

export function swipeStarts(dx: number, dy: number, startPx = SWIPE_START_PX): boolean {
  return dx <= -startPx && Math.abs(dx) / 3 > Math.abs(dy);
}

export function swipeOffset(dx: number, limitPx = SWIPE_LIMIT_PX): number {
  return Math.max(-limitPx, Math.min(0, dx));
}

export function swipeIconProgress(offset: number): number {
  return Math.max(0, Math.min(1, (-offset - SWIPE_ICON_FROM_PX) / SWIPE_ICON_SPAN_PX));
}

function decelerate(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function useSwipeAction<T extends HTMLElement>({
  threshold = SWIPE_THRESHOLD_PX,
  maxDrag = SWIPE_LIMIT_PX,
  onTrigger,
  disabled,
}: SwipeActionOptions) {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);
  const gesture = useRef({
    active: false,
    locked: false,
    blocked: false,
    startX: 0,
    startY: 0,
    captureX: 0,
    offset: 0,
    armed: false,
  });

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function setOffset(px: number): void {
    gesture.current.offset = px;
    ref.current?.style.setProperty('--swipe-x', `${px}px`);
    ref.current?.style.setProperty('--swipe-progress', swipeIconProgress(px).toFixed(3));
  }

  function setArmed(armed: boolean): void {
    if (!ref.current) return;
    if (armed) ref.current.dataset.swipeArmed = 'true';
    else delete ref.current.dataset.swipeArmed;
  }

  function animateBack(from: number): void {
    cancelAnimationFrame(frame.current);
    const duration = cssDurationMs(RETURN_TOKEN);
    if (from === 0 || duration <= 1) {
      setOffset(0);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      setOffset(from * (1 - decelerate(t)));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }

  function release(): boolean {
    const g = gesture.current;
    const wasDrag = g.locked;
    if (g.active && g.locked && g.armed) onTrigger();
    const from = g.offset;
    g.active = false;
    g.locked = false;
    g.blocked = false;
    g.armed = false;
    setArmed(false);
    animateBack(from);
    return wasDrag;
  }

  function onPointerDown(event: ReactPointerEvent): void {
    if (disabled?.()) return;
    cancelAnimationFrame(frame.current);
    setOffset(0);
    gesture.current = {
      active: true,
      locked: false,
      blocked: false,
      startX: event.clientX,
      startY: event.clientY,
      captureX: 0,
      offset: 0,
      armed: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent): void {
    const g = gesture.current;
    if (!g.active || g.blocked) return;

    if (!g.locked) {
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (swipeStarts(dx, dy)) {
        g.locked = true;
        g.captureX = event.clientX;
      } else {
        if (Math.abs(dy) > TAP_SLOP_PX || dx > TAP_SLOP_PX) g.blocked = true;
        return;
      }
    }

    const offset = swipeOffset(event.clientX - g.captureX, maxDrag);
    setOffset(offset);

    const nowArmed = -offset >= threshold;
    if (nowArmed !== g.armed) {
      g.armed = nowArmed;
      setArmed(nowArmed);
      if (nowArmed) haptic();
    }
  }

  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp: release,
    onPointerCancel: release,
  };
}
