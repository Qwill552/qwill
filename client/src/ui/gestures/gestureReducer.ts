/**
 * Чистая логика жестов сообщения — без обращений к DOM, чтобы быть проверяемой unit-тестами
 * (этап 15). Разводит два конфликта из `ux-ui/gestures.md`: одиночный тап против двойного
 * (таймингом) и любой жест против начавшегося скролла (эпохой, см. ниже).
 */

/** Второй тап позже этого окна после первого считается новым одиночным, не второй половиной пары. */
export const DOUBLE_TAP_WINDOW_MS = 250;
/** Длительность long-press до срабатывания выделения сообщения. */
export const LONG_PRESS_MS = 500;
/** Смещение пальца, после которого жест считается скроллом/свайпом, а не тапом или long-press'ом. */
export const MOVE_CANCEL_PX = 10;

export type TapOutcome = 'single' | 'double';

/** Второй тап в пределах DOUBLE_TAP_WINDOW_MS после первого — двойной, иначе одиночный
 *  (ux-ui/gestures.md, «Одиночный тап против двойного»). */
export function resolveTap(previousTapAt: number | null, now: number): TapOutcome {
  if (previousTapAt !== null && now - previousTapAt <= DOUBLE_TAP_WINDOW_MS) return 'double';
  return 'single';
}

/** Смещение за порог по прямой — жест отменяется (ux-ui/gestures.md, «Общие правила», п.2). */
export function exceedsMoveThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > MOVE_CANCEL_PX;
}

/**
 * Начавшийся скролл ленты отменяет любой висящий жест — таймер long-press или окно
 * двойного тапа. Таймеры сообщения и скролл живут в разных обработчиках (row vs list),
 * поэтому отмена не может быть прямым вызовом — вместо этого таймер при срабатывании
 * сверяет счётчик с тем, что был на его старте: список бампает счётчик на каждый scroll,
 * таймер, запущенный до бампа, тихо не срабатывает.
 */
let scrollEpoch = 0;

export function bumpScrollEpoch(): void {
  scrollEpoch += 1;
}

export function currentScrollEpoch(): number {
  return scrollEpoch;
}
