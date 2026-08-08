import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { LONG_PRESS_MS, currentScrollEpoch, exceedsMoveThreshold } from './gestureReducer';

interface LongPressOptions {
  onLongPress: () => void;
  /** Не запускать жест — например, уже открыто контекстное меню (ux-ui/06-message-interaction.md). */
  disabled?: () => boolean;
}

/**
 * Long-press 500 мс → выделение сообщения. Не запускает таймер, если `pointerdown` пришёл
 * на элемент с `data-selectable` (текст пузыря — там работает нативное выделение браузера,
 * см. `ux-ui/gestures.md`, «Выделение текста против выделения сообщения»). Отменяется
 * движением пальца за порог, скроллом ленты (эпоха) и на десктопе не действует вовсе —
 * там правая кнопка мыши (`ux-ui/gestures.md`, «Общие правила», п.4).
 */
export function useLongPress({ onLongPress, disabled }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const clear = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if ((event.target as HTMLElement).closest('[data-selectable]')) return;

      startRef.current = { x: event.clientX, y: event.clientY };
      const epoch = currentScrollEpoch();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (epoch !== currentScrollEpoch()) return;
        if (disabled?.()) return;
        callbackRef.current();
      }, LONG_PRESS_MS);
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const start = startRef.current;
      if (!start || timerRef.current === null) return;
      if (exceedsMoveThreshold(event.clientX - start.x, event.clientY - start.y)) clear();
    },
    [clear],
  );

  return { onPointerDown, onPointerMove, onPointerUp: clear, onPointerCancel: clear };
}
