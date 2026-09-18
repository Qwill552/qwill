import { describe, expect, it } from 'vitest';

import { DEMO_RETURN } from '../../config';
import {
  advanceDeviation,
  holdDeviation,
  isOverrideAlive,
  releaseDeviation,
  REST_DEVIATION,
  settleDeviation,
  type ContinuousDeviation,
  type ReturnConfig,
} from './deviation';

const CONFIG: ReturnConfig = DEMO_RETURN;
const FRAME_MS = 16;

function run(start: ContinuousDeviation, spanMs: number, startedAtMs = 0): ContinuousDeviation {
  let state = start;
  for (let elapsed = 0; elapsed < spanMs; elapsed += FRAME_MS) {
    state = advanceDeviation(state, FRAME_MS, startedAtMs + elapsed, CONFIG);
  }
  return state;
}

function released(offset: number, velocity: number): ContinuousDeviation {
  return releaseDeviation(holdDeviation(REST_DEVIATION, offset), velocity, 0);
}

describe('отклонение непрерывного канала', () => {
  it('пока палец на экране — не затухает и не летит', () => {
    const held = holdDeviation(REST_DEVIATION, 140);
    expect(run(held, 4000).offset).toBe(140);
  });

  it('до истечения простоя летит по инерции и замедляется', () => {
    const start = released(0, -0.6);
    const early = run(start, 200);
    const late = run(start, 800);
    expect(Math.abs(early.offset)).toBeGreaterThan(0);
    expect(Math.abs(late.offset)).toBeGreaterThan(Math.abs(early.offset));
    expect(Math.abs(late.velocity)).toBeLessThan(Math.abs(early.velocity));
  });

  it('после простоя приходит к нулю примерно за полсекунды', () => {
    const start = released(180, 0);
    const atIdle = run(start, CONFIG.idleMs);
    expect(Math.abs(atIdle.offset)).toBeCloseTo(180, 0);

    const halfway = run(start, CONFIG.idleMs + 250);
    expect(Math.abs(halfway.offset)).toBeLessThan(90);
    expect(Math.abs(halfway.offset)).toBeGreaterThan(0);

    expect(run(start, CONFIG.idleMs + 600).offset).toBe(0);
  });

  it('перелёта нет ни при каком начальном броске', () => {
    for (const offset of [-320, -90, -12, 12, 90, 320]) {
      for (const velocity of [-1.4, -0.3, 0, 0.3, 1.4]) {
        let state = settleDeviation(released(offset, velocity));
        const sign = Math.sign(offset);
        for (let elapsed = 0; elapsed < 3000; elapsed += FRAME_MS) {
          state = advanceDeviation(state, FRAME_MS, elapsed, CONFIG);
          expect(Math.sign(state.offset) === sign || state.offset === 0).toBe(true);
        }
        expect(state.offset).toBe(0);
      }
    }
  });

  it('старт возврата мягкий: скорость набирается, а не берётся с места', () => {
    let state = run(released(200, 0), CONFIG.idleMs);
    const steps: number[] = [];
    for (let elapsed = 0; elapsed < 800; elapsed += FRAME_MS) {
      const next = advanceDeviation(state, FRAME_MS, CONFIG.idleMs + elapsed, CONFIG);
      steps.push(Math.abs(state.offset - next.offset));
      state = next;
    }

    const fastest = Math.max(...steps);
    expect(steps.indexOf(fastest)).toBeGreaterThan(0);
    expect(steps[0] ?? 0).toBeLessThan(fastest / 2);
  });

  it('крупный шаг времени не выкидывает пружину за ноль', () => {
    const start = settleDeviation(released(260, 0));
    const jumped = advanceDeviation(start, 50, 0, CONFIG);
    expect(jumped.offset).toBeGreaterThanOrEqual(0);
    expect(jumped.offset).toBeLessThanOrEqual(260);
  });

  it('досрочный возврат не ждёт простоя', () => {
    const start = settleDeviation(released(120, 0));
    expect(run(start, 600).offset).toBe(0);
  });

  it('покой остаётся покоем', () => {
    expect(run(REST_DEVIATION, 5000)).toBe(REST_DEVIATION);
  });
});

describe('переопределение дискретного канала', () => {
  it('живёт ровно свой простой', () => {
    const override = { value: 'chat', atMs: 1000 };
    expect(isOverrideAlive(override, 1000, 1600)).toBe(true);
    expect(isOverrideAlive(override, 2599, 1600)).toBe(true);
    expect(isOverrideAlive(override, 2600, 1600)).toBe(false);
  });

  it('бесконечный простой не снимается никогда', () => {
    const override = { value: 'chat', atMs: 0 };
    expect(isOverrideAlive(override, 1e9, Number.POSITIVE_INFINITY)).toBe(true);
  });
});
