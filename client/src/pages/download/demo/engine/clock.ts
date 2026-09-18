import { DEMO_CLOCK } from '../../config';

export type FrameTick = (dtMs: number, nowMs: number) => void;

const ticks = new Set<FrameTick>();
const onScreen = new Set<Element>();

let frame = 0;
let lastMs = 0;
let intersections: IntersectionObserver | null = null;
let watchingVisibility = false;

function shouldRun(): boolean {
  if (ticks.size === 0 || onScreen.size === 0) return false;
  return typeof document === 'undefined' || !document.hidden;
}

function step(nowMs: number): void {
  frame = requestAnimationFrame(step);
  const dtMs = Math.min(nowMs - lastMs, DEMO_CLOCK.maxFrameMs);
  lastMs = nowMs;
  if (dtMs <= 0) return;
  for (const tick of ticks) tick(dtMs, nowMs);
}

function sync(): void {
  if (shouldRun() && frame === 0) {
    lastMs = performance.now();
    frame = requestAnimationFrame(step);
    return;
  }
  if (!shouldRun() && frame !== 0) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

function watchVisibility(): void {
  if (watchingVisibility || typeof document === 'undefined') return;
  watchingVisibility = true;
  document.addEventListener('visibilitychange', sync);
}

export function onFrame(tick: FrameTick): () => void {
  watchVisibility();
  ticks.add(tick);
  sync();
  return () => {
    ticks.delete(tick);
    sync();
  };
}

export function whileOnScreen(element: Element): () => void {
  if (!intersections) {
    intersections = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      sync();
    });
  }
  intersections.observe(element);
  return () => {
    intersections?.unobserve(element);
    onScreen.delete(element);
    sync();
  };
}
