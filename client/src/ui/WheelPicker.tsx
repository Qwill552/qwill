import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { haptic } from './haptic';
import { cssDurationMs } from './motion';
import {
  clampFlingVelocity,
  decelerate,
  edgeFalloff,
  flingOf,
  flingProgress,
  MIN_FLING_VELOCITY,
  viscousFluid,
} from './wheelScroller';
import styles from './WheelPicker.module.css';

const ITEM_SIZE = 42;
const TOUCH_SLOP = 8;
const TAP_WINDOW_MS = 300;
const VELOCITY_WINDOW_MS = 100;

interface WheelPickerProps {
  value: number;
  min: number;
  max: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  label: string;
  /** Сдвиг текста внутри колонки: три барабана даты читаются одной строкой, а не столбиками. */
  textOffset?: number;
  className?: string;
}

type MotionKind = 'fling' | 'settle' | 'step';

interface Motion {
  kind: MotionKind;
  startedAt: number;
  durationMs: number;
  distance: number;
  travelled: number;
  curve: (progress: number) => number;
  frame: number;
}

function visibleItemCount(): number {
  return window.innerWidth > window.innerHeight ? 3 : 5;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WheelPicker({ value, min, max, format, onChange, label, textOffset = 0, className }: WheelPickerProps) {
  const [itemCount, setItemCount] = useState(visibleItemCount);

  const selectionRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLSpanElement | null)[]>([]);

  const geometry = useRef({ height: 0, textSize: 0, gap: 0, element: 0, initialOffset: 0 });
  const state = useRef({ offset: 0, value });
  const limits = useRef({ min, max });
  const latest = useRef({ format, onChange, textOffset });
  const motion = useRef<Motion | null>(null);
  const gesture = useRef({
    pointerId: -1,
    dragging: false,
    startY: 0,
    lastY: 0,
    startedAt: 0,
    samples: [] as { at: number; y: number }[],
  });

  useLayoutEffect(() => {
    latest.current = { format, onChange, textOffset };
    limits.current = { min, max };
  });

  const middleIndex = Math.floor(itemCount / 2);

  const paint = useCallback(() => {
    const { height, textSize, element } = geometry.current;
    if (element === 0) return;

    const center = height / 2;
    const radius = height / 2;
    const offsetX = latest.current.textOffset;
    const { min: low, max: high } = limits.current;

    for (let slot = 0; slot < itemsRef.current.length; slot += 1) {
      const node = itemsRef.current[slot];
      if (!node) continue;

      const slotValue = state.current.value + slot - middleIndex;
      const text = slotValue < low || slotValue > high ? '' : latest.current.format(slotValue);
      if (node.textContent !== text) node.textContent = text;

      const y = state.current.offset + slot * element;
      const closeness = edgeFalloff(y < center ? y / radius : (height - y) / radius);
      const shift = y < center ? (1 - closeness) * textSize : -(1 - closeness) * textSize;

      node.style.transform =
        `translate(${offsetX}px, ${y - textSize / 2 + shift}px) scale(${0.8 + closeness * 0.2}, ${closeness})`;
      node.style.opacity = closeness < 0.1 ? String(closeness / 0.1) : '1';
    }
  }, [middleIndex]);

  const measure = useCallback(() => {
    const first = itemsRef.current[0];
    if (!first) return;

    const height = itemCount * ITEM_SIZE;
    const textSize = Number.parseFloat(getComputedStyle(first).fontSize) || 0;
    const gap = Math.round((height + textSize - itemCount * textSize) / itemCount);
    const element = textSize + gap;
    const initialOffset = height / 2 - element * middleIndex;

    geometry.current = { height, textSize, gap, element, initialOffset };
    state.current.offset = initialOffset;

    const selection = selectionRef.current;
    if (selection) {
      selection.style.height = `${element}px`;
      selection.style.top = `${(height - element) / 2}px`;
    }
    paint();
  }, [itemCount, middleIndex, paint]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const onResize = (): void => setItemCount(visibleItemCount());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(
    () => () => {
      if (motion.current) cancelAnimationFrame(motion.current.frame);
      motion.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    if (gesture.current.dragging || motion.current) return;
    if (state.current.value !== value) {
      state.current.value = value;
      state.current.offset = geometry.current.initialOffset;
    }
    paint();
  }, [value, min, max, paint]);

  function setValueInternal(next: number): void {
    const { min: low, max: high } = limits.current;
    const clamped = Math.min(Math.max(next, low), high);
    if (clamped === state.current.value) return;

    state.current.value = clamped;
    haptic();
    latest.current.onChange(clamped);
  }

  function scrollBy(delta: number): void {
    const { gap, element, initialOffset } = geometry.current;
    if (element === 0) return;
    const { min: low, max: high } = limits.current;
    const current = state.current;

    if (delta > 0 && current.value <= low && current.offset + delta > initialOffset) {
      current.offset = initialOffset;
      paint();
      return;
    }
    if (delta < 0 && current.value >= high && current.offset + delta < initialOffset) {
      current.offset = initialOffset;
      paint();
      return;
    }

    current.offset += delta;
    let next = current.value;

    while (current.offset - initialOffset > gap) {
      current.offset -= element;
      next -= 1;
      if (next <= low && current.offset > initialOffset) current.offset = initialOffset;
    }
    while (current.offset - initialOffset < -gap) {
      current.offset += element;
      next += 1;
      if (next >= high && current.offset < initialOffset) current.offset = initialOffset;
    }

    setValueInternal(next);
    paint();
  }

  function stopMotion(): void {
    if (motion.current) cancelAnimationFrame(motion.current.frame);
    motion.current = null;
  }

  function startMotion(
    kind: MotionKind,
    distance: number,
    durationMs: number,
    curve: (progress: number) => number,
  ): void {
    stopMotion();
    if (durationMs <= 1 || distance === 0) {
      scrollBy(distance);
      if (kind === 'fling') settle();
      return;
    }

    const run: Motion = { kind, startedAt: performance.now(), durationMs, distance, travelled: 0, curve, frame: 0 };

    const advance = (now: number): void => {
      const progress = Math.min(1, (now - run.startedAt) / run.durationMs);
      const travelled = run.curve(progress) * run.distance;
      scrollBy(travelled - run.travelled);
      run.travelled = travelled;

      if (progress < 1) {
        run.frame = requestAnimationFrame(advance);
        return;
      }
      motion.current = null;
      if (run.kind === 'fling') settle();
    };

    run.frame = requestAnimationFrame(advance);
    motion.current = run;
  }

  function settle(): void {
    const { element, initialOffset } = geometry.current;
    let delta = initialOffset - state.current.offset;
    if (delta === 0) return;
    if (Math.abs(delta) > element / 2) delta += delta > 0 ? -element : element;
    startMotion('settle', delta, cssDurationMs('--dur-wheel-settle'), decelerate);
  }

  function stepByOne(increment: boolean): void {
    const { element, initialOffset } = geometry.current;
    if (element === 0) return;
    stopMotion();

    let aligned = initialOffset - state.current.offset;
    if (aligned !== 0) {
      if (Math.abs(aligned) > element / 2) aligned += aligned > 0 ? -element : element;
      scrollBy(aligned);
    }
    startMotion('step', increment ? -element : element, cssDurationMs('--dur-wheel-step'), viscousFluid);
  }

  function velocityOf(): number {
    const samples = gesture.current.samples;
    const oldest = samples[0];
    const newest = samples.at(-1);
    if (!oldest || !newest || newest.at === oldest.at) return 0;
    return ((newest.y - oldest.y) / (newest.at - oldest.at)) * 1000;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    stopMotion();

    gesture.current = {
      pointerId: event.pointerId,
      dragging: false,
      startY: event.clientY,
      lastY: event.clientY,
      startedAt: event.timeStamp,
      samples: [{ at: event.timeStamp, y: event.clientY }],
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = gesture.current;
    if (drag.pointerId !== event.pointerId) return;
    event.stopPropagation();

    drag.samples.push({ at: event.timeStamp, y: event.clientY });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0]!.at > VELOCITY_WINDOW_MS) {
      drag.samples.shift();
    }

    if (!drag.dragging) {
      if (Math.abs(event.clientY - drag.startY) <= TOUCH_SLOP) return;
      drag.dragging = true;
      drag.lastY = event.clientY;
      return;
    }

    scrollBy(event.clientY - drag.lastY);
    drag.lastY = event.clientY;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = gesture.current;
    if (drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.pointerId = -1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const wasDragging = drag.dragging;
    drag.dragging = false;

    const velocity = clampFlingVelocity(velocityOf());
    if (Math.abs(velocity) > MIN_FLING_VELOCITY && !prefersReducedMotion()) {
      const fling = flingOf(velocity);
      startMotion('fling', fling.distance, fling.durationMs, flingProgress);
      return;
    }

    const travelled = Math.abs(event.clientY - drag.startY);
    if (!wasDragging && travelled <= TOUCH_SLOP && event.timeStamp - drag.startedAt < TAP_WINDOW_MS) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const slot = Math.floor((event.clientY - bounds.top) / geometry.current.element) - middleIndex;
      if (slot > 0) stepByOne(true);
      else if (slot < 0) stepByOne(false);
      return;
    }

    settle();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      stepByOne(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      stepByOne(true);
    }
  }

  return (
    <div
      className={`${styles.wheel} ${className ?? ''}`}
      style={{ height: `${itemCount * ITEM_SIZE}px` }}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={format(value)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <div ref={selectionRef} className={styles.selection} aria-hidden="true" />
      <div className={styles.items} aria-hidden="true">
        {Array.from({ length: itemCount }, (_, slot) => (
          <span
            key={slot}
            ref={(node) => {
              itemsRef.current[slot] = node;
            }}
            className={styles.item}
          />
        ))}
      </div>
    </div>
  );
}
