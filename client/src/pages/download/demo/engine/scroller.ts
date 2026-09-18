import { DEMO_GESTURE } from '../../config';

export type ScrollAnchor = 'top' | 'bottom';

export interface ScrollRange {
  min: number;
  max: number;
  extent: number;
}

export interface ScrollerHandlers {
  range(): ScrollRange;
  value(): number;
  drag(value: number): void;
  release(value: number, velocity: number, beyondRange: boolean): void;
}

interface Sample {
  value: number;
  atMs: number;
}

export const EMPTY_RANGE: ScrollRange = { min: 0, max: 0, extent: 0 };

function rubber(over: number, extent: number): number {
  if (extent <= 0) return 0;
  const factor = DEMO_GESTURE.rubberFactor;
  return ((1 - 1 / ((over * factor) / extent + 1)) * extent) / factor;
}

export function withRubber(value: number, range: ScrollRange): number {
  if (value < range.min) return range.min - rubber(range.min - value, range.extent);
  if (value > range.max) return range.max + rubber(value - range.max, range.extent);
  return value;
}

export function clampToRange(value: number, range: ScrollRange): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function velocityOf(samples: Sample[]): number {
  const oldest = samples[0];
  const newest = samples[samples.length - 1];
  if (!oldest || !newest) return 0;
  const spanMs = newest.atMs - oldest.atMs;
  if (spanMs <= 0) return 0;
  const raw = (newest.value - oldest.value) / spanMs;
  const capped = Math.min(DEMO_GESTURE.maxVelocity, Math.abs(raw));
  return Math.sign(raw) * capped;
}

export function attachScroller(viewport: HTMLElement, handlers: ScrollerHandlers): () => void {
  let activePointer: number | null = null;
  let startClientY = 0;
  let startValue = 0;
  let scale = 1;
  let range = EMPTY_RANGE;
  let samples: Sample[] = [];

  function down(event: PointerEvent): void {
    if (activePointer !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    viewport.setPointerCapture(event.pointerId);
    startClientY = event.clientY;
    startValue = handlers.value();
    range = handlers.range();
    const measured = viewport.getBoundingClientRect().height;
    const logical = viewport.clientHeight;
    scale = logical > 0 && measured > 0 ? measured / logical : 1;
    samples = [{ value: startValue, atMs: event.timeStamp }];
  }

  function move(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    const travelled = (event.clientY - startClientY) / scale;
    const value = withRubber(startValue - travelled, range);
    samples.push({ value, atMs: event.timeStamp });
    const cutoffMs = event.timeStamp - DEMO_GESTURE.velocityWindowMs;
    while (samples.length > 2 && (samples[0]?.atMs ?? 0) < cutoffMs) samples.shift();
    handlers.drag(value);
  }

  function finish(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    const value = samples[samples.length - 1]?.value ?? startValue;
    handlers.release(value, velocityOf(samples), value < range.min || value > range.max);
    samples = [];
  }

  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', finish);
  viewport.addEventListener('pointercancel', finish);

  return () => {
    viewport.removeEventListener('pointerdown', down);
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', finish);
    viewport.removeEventListener('pointercancel', finish);
  };
}

export function attachTap(root: HTMLElement, onTap: (node: HTMLElement) => void): () => void {
  let candidate: { node: HTMLElement | null; x: number; y: number; atMs: number } | null = null;

  function down(event: PointerEvent): void {
    const target = event.target;
    const marked = target instanceof Element ? target.closest('[data-demo-tap]') : null;
    candidate = {
      node: marked instanceof HTMLElement ? marked : null,
      x: event.clientX,
      y: event.clientY,
      atMs: event.timeStamp,
    };
  }

  function up(event: PointerEvent): void {
    const started = candidate;
    candidate = null;
    if (!started?.node) return;
    if (event.timeStamp - started.atMs > DEMO_GESTURE.tapMaxMs) return;
    if (Math.hypot(event.clientX - started.x, event.clientY - started.y) > DEMO_GESTURE.tapSlopPx) return;
    onTap(started.node);
  }

  function cancel(): void {
    candidate = null;
  }

  root.addEventListener('pointerdown', down);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);

  return () => {
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointerup', up);
    root.removeEventListener('pointercancel', cancel);
  };
}
