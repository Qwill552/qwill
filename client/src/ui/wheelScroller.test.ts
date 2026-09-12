import { describe, expect, it } from 'vitest';

import { clampFlingVelocity, decelerate, edgeFalloff, flingOf, flingProgress, viscousFluid } from './wheelScroller';

describe('wheelScroller: бросок барабана (R-33C, числа из Scroller.java)', () => {
  it('скорость 2000 px/с даёт ровно 1000 мс и 800 px', () => {
    const fling = flingOf(2000);

    expect(fling.durationMs).toBeCloseTo(1000, 6);
    expect(fling.distance).toBeCloseTo(800, 6);
  });

  it('скорость 1000 px/с даёт 669 мс и 268 px', () => {
    const fling = flingOf(1000);

    expect(Math.trunc(fling.durationMs)).toBe(669);
    expect(Math.round(fling.distance)).toBe(268);
  });

  it('бросок вверх — та же длительность, путь со знаком', () => {
    const up = flingOf(-2000);

    expect(up.durationMs).toBeCloseTo(1000, 6);
    expect(up.distance).toBeCloseTo(-800, 6);
  });

  it('стоящий палец броска не даёт', () => {
    expect(flingOf(0)).toEqual({ durationMs: 0, distance: 0 });
  });

  it('скорость обрезается сверху потолком Android, знак сохраняется', () => {
    expect(clampFlingVelocity(7400)).toBe(1000);
    expect(clampFlingVelocity(-7400)).toBe(-1000);
    expect(clampFlingVelocity(320)).toBe(320);
  });
});

describe('wheelScroller: кривые', () => {
  const curves = { flingProgress, decelerate, viscousFluid, edgeFalloff };

  for (const [name, curve] of Object.entries(curves)) {
    it(`${name}: в нуле 0, в конце 1, монотонна`, () => {
      expect(curve(0)).toBeCloseTo(0, 6);
      expect(curve(1)).toBeCloseTo(1, 6);

      let previous = 0;
      for (let step = 1; step <= 100; step += 1) {
        const value = curve(step / 100);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    });
  }

  it('бросок проходит больше половины пути за первую четверть времени', () => {
    expect(flingProgress(0.25)).toBeGreaterThan(0.5);
  });

  it('доводка тормозит: за первую половину времени проходит больше 90% пути', () => {
    expect(decelerate(0.5)).toBeGreaterThan(0.9);
  });

  it('затухание у края держит строку крупной почти до самого края', () => {
    expect(edgeFalloff(0.5)).toBeCloseTo(0.84, 2);
    expect(edgeFalloff(0.25)).toBeCloseTo(0.62, 2);
    expect(edgeFalloff(0.05)).toBeCloseTo(0.28, 2);
  });
});
