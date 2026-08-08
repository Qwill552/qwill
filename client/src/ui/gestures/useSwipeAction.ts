import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { haptic } from '../haptic';

interface SwipeActionOptions {
  /** Порог срабатывания, px протянуто. */
  threshold?: number;
  /** Максимум протягивания, дальше — сопротивление. */
  maxDrag?: number;
  onTrigger: () => void;
  disabled?: () => boolean;
}

/** Доля движения пальца сверх maxDrag, которая реально сдвигает элемент — «сопротивление». */
const OVERSHOOT_RESISTANCE = 0.35;
/** Раньше этого по горизонтали жест не считается начатым — короткое дрожание пальца не в счёт. */
const LOCK_THRESHOLD_PX = 10;

/**
 * Свайп влево по строке — ответ (ux-ui/gestures.md, «Свайп для ответа»). Порог 40 px,
 * максимум протягивания 72 px, дальше — сопротивление; блокируется, если по вертикали
 * ушли больше чем на 10 px раньше, чем по горизонтали (внутри списка, который скроллится
 * вертикально — этот жест не должен мешать обычному скроллу).
 *
 * Смещение применяется императивно через CSS-переменную на ref (тот же приём, что у
 * `Sheet.tsx`/`offsetTo`), а не через `setState` на каждый `pointermove` — иначе перерисовка
 * всей строки на каждый пиксель протяжки заметно лагает. Указатель не захватывается
 * (`setPointerCapture`) специально: строка лежит внутри вертикально скроллящегося списка,
 * и нативный скролл должен продолжать получать те же touch-события.
 */
export function useSwipeAction<T extends HTMLElement>({
  threshold = 40,
  maxDrag = 72,
  onTrigger,
  disabled,
}: SwipeActionOptions) {
  const ref = useRef<T | null>(null);
  const gesture = useRef({
    active: false,
    locked: false,
    blocked: false,
    startX: 0,
    startY: 0,
    armed: false,
  });

  function setOffset(px: number, progress: number): void {
    ref.current?.style.setProperty('--swipe-x', `${px}px`);
    // Отдельное unitless-число для CSS (прозрачность/поворот иконки) — деление двух
    // величин в px в calc() требует typed arithmetic (CSS Values 4), не везде надёжно;
    // проще посчитать долю в JS, чем полагаться на поддержку в рантайме.
    ref.current?.style.setProperty('--swipe-progress', progress.toFixed(3));
  }

  function setArmed(armed: boolean): void {
    if (!ref.current) return;
    if (armed) ref.current.dataset.swipeArmed = 'true';
    else delete ref.current.dataset.swipeArmed;
  }

  /** Возвращает true, если жест успел стать горизонтальным протягиванием (locked) —
   *  по этому признаку вызывающая сторона отличает «это был свайп» от «это был тап»
   *  и не запускает поверх него логику одиночного/двойного тапа (см. MessageRow). */
  function release(): boolean {
    const g = gesture.current;
    const wasDrag = g.locked;
    if (g.active && g.armed) onTrigger();
    g.active = false;
    g.locked = false;
    g.blocked = false;
    g.armed = false;
    setOffset(0, 0);
    setArmed(false);
    return wasDrag;
  }

  function onPointerDown(event: ReactPointerEvent): void {
    if (disabled?.()) return;
    gesture.current = { active: true, locked: false, blocked: false, startX: event.clientX, startY: event.clientY, armed: false };
  }

  function onPointerMove(event: ReactPointerEvent): void {
    const g = gesture.current;
    if (!g.active || g.blocked) return;

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;

    if (!g.locked) {
      if (Math.abs(dy) > LOCK_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx)) {
        g.blocked = true;
        return;
      }
      if (Math.abs(dx) < LOCK_THRESHOLD_PX) return;
      g.locked = true;
    }

    const raw = Math.min(0, dx);
    const overshoot = Math.max(0, -raw - maxDrag);
    const resisted = overshoot > 0 ? -(maxDrag + overshoot * OVERSHOOT_RESISTANCE) : raw;
    const progress = Math.min(1, -resisted / threshold);
    setOffset(resisted, progress);

    const nowArmed = -resisted >= threshold;
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
