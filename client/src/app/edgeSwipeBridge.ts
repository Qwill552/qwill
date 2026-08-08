/**
 * Мост между жестом «назад» (владеет ScreenStack) и строкой сообщения (владеет
 * MessageRow) для арбитража свайпа у левого края ленты чата (ux-ui.md, журнал, этап 6).
 *
 * ScreenStack остаётся единственным местом, которое знает о навигации/анимации перехода;
 * MessageRow остаётся единственным местом, которое знает о long-press/тапе/свайпе-ответе.
 * Ни один из них не импортирует другой напрямую — оба зависят только от этого модуля,
 * тем же приёмом, что и `useBackHandler.ts` (модульное состояние, а не React Context).
 *
 * Точка передачи — момент, когда MessageRow сама решает, что палец, стартовавший у края,
 * потянул вправо: она отменяет свои таймеры и зовёт `beginExternalEdgeSwipe` с координатами
 * НАСТОЯЩЕГО pointerdown (а не текущего pointermove) — ScreenStack считает смещение от этой
 * точки, поэтому в момент передачи экран уже стоит там, где должен, без «доезжания» до пальца.
 */

export interface EdgeSwipePoint {
  x: number;
  y: number;
  timeStamp: number;
}

interface EdgeSwipeHandlers {
  begin: (point: EdgeSwipePoint) => void;
  update: (point: EdgeSwipePoint) => void;
  /** Финальные координаты уже не нужны — commit/settle считается по тому, что накопили
   *  предыдущие update() (прогресс и мгновенная скорость), см. ScreenStack.endDrag. */
  end: () => void;
  cancel: () => void;
}

/** Ширина полосы у левого края, в которой стартовавший вправо-свайп может быть перехвачен
 *  навигацией «назад» вместо жеста сообщения. Тот же порядок величины, что и `EDGE_ZONE`
 *  в ScreenStack для остальных экранов — единая константа, чтобы не разойтись со временем. */
export const EDGE_SWIPE_ZONE_PX = 32;

/** Насколько нужно потянуть по горизонтали, прежде чем MessageRow отдаёт жест навигации.
 *  Совпадает с порогом, которым свайп-ответ (`useSwipeAction`) отличает протяжку от дрожания
 *  пальца — та же чувствительность, тот же «на глаз» размер. */
export const EDGE_SWIPE_LOCK_PX = 10;

let activeHandlers: EdgeSwipeHandlers | null = null;

/** Вызывается один раз ScreenStack при монтировании. */
export function registerEdgeSwipeHandlers(handlers: EdgeSwipeHandlers): () => void {
  activeHandlers = handlers;
  return () => {
    if (activeHandlers === handlers) activeHandlers = null;
  };
}

export function beginExternalEdgeSwipe(point: EdgeSwipePoint): void {
  activeHandlers?.begin(point);
}

export function updateExternalEdgeSwipe(point: EdgeSwipePoint): void {
  activeHandlers?.update(point);
}

export function endExternalEdgeSwipe(): void {
  activeHandlers?.end();
}

export function cancelExternalEdgeSwipe(): void {
  activeHandlers?.cancel();
}
