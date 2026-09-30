import { describe, expect, it } from 'vitest';

import {
  SWIPE_LIMIT_PX,
  SWIPE_START_PX,
  SWIPE_THRESHOLD_PX,
  swipeIconProgress,
  swipeOffset,
  swipeStarts,
} from './useSwipeAction';

describe('свайп-ответ по числам Telegram', () => {
  it('старт — 0.4 см влево и втрое больше по горизонтали, чем по вертикали', () => {
    expect(SWIPE_START_PX).toBeCloseTo(15.118, 2);
    expect(swipeStarts(-16, 5)).toBe(true);
    expect(swipeStarts(-15, 0)).toBe(false);
    expect(swipeStarts(16, 0)).toBe(false);
    expect(swipeStarts(-30, 10)).toBe(false);
  });

  it('сдвиг — не дальше 80 и только влево', () => {
    expect(SWIPE_LIMIT_PX).toBe(80);
    expect(swipeOffset(-200)).toBe(-80);
    expect(swipeOffset(40)).toBe(0);
    expect(swipeOffset(-35)).toBe(-35);
  });

  it('значок проявляется на участке 20…50, порог — 50', () => {
    expect(SWIPE_THRESHOLD_PX).toBe(50);
    expect(swipeIconProgress(-20)).toBe(0);
    expect(swipeIconProgress(-35)).toBe(0.5);
    expect(swipeIconProgress(-50)).toBe(1);
    expect(swipeIconProgress(-80)).toBe(1);
  });
});
