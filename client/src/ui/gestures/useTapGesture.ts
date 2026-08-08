import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { DOUBLE_TAP_WINDOW_MS, currentScrollEpoch, resolveTap } from './gestureReducer';

interface TapPoint {
  x: number;
  y: number;
}

interface TapGestureOptions {
  /** Таймер истёк без второго тапа — открыть контекстное меню. */
  onSingleTap: () => void;
  /** Второй тап в окне DOUBLE_TAP_WINDOW_MS — реакция по умолчанию из точки касания. */
  onDoubleTap: (point: TapPoint) => void;
  disabled?: () => boolean;
}

/**
 * Тап против двойного тапа (ux-ui/gestures.md, «Одиночный тап против двойного»):
 * `pointerup` запускает таймер DOUBLE_TAP_WINDOW_MS. Второй тап в окне отменяет таймер и
 * ставит реакцию; таймер истёк — открывается меню. Задержка выбрана так, чтобы двойной тап
 * никогда не мигал меню перед собой.
 */
export function useTapGesture({ onSingleTap, onDoubleTap, disabled }: TapGestureOptions) {
  const lastTapAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleRef = useRef(onSingleTap);
  const doubleRef = useRef(onDoubleTap);
  singleRef.current = onSingleTap;
  doubleRef.current = onDoubleTap;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    lastTapAtRef.current = null;
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (disabled?.()) return;

      const now = event.timeStamp;
      const outcome = resolveTap(lastTapAtRef.current, now);

      if (outcome === 'double') {
        cancel();
        doubleRef.current({ x: event.clientX, y: event.clientY });
        return;
      }

      lastTapAtRef.current = now;
      const epoch = currentScrollEpoch();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastTapAtRef.current = null;
        if (epoch !== currentScrollEpoch()) return;
        singleRef.current();
      }, DOUBLE_TAP_WINDOW_MS);
    },
    [cancel, disabled],
  );

  return { onPointerUp, cancel };
}
