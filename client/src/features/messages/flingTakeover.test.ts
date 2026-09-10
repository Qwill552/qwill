import { describe, expect, it } from 'vitest';

import { distanceCoefficient, fingerVelocity, flingDistance, flingDurationSeconds } from './flingTakeover';

describe('кривая инерции OverScroller', () => {
  it('повторяет путь и длительность броска из замера', () => {
    expect(flingDistance(28000)).toBeGreaterThan(62000);
    expect(flingDistance(28000)).toBeLessThan(64500);
    expect(flingDurationSeconds(10000)).toBeCloseTo(3.02, 1);
    expect(flingDurationSeconds(13000)).toBeCloseTo(3.67, 1);
  });

  it('стартует ровно с той скорости, с которой брошено', () => {
    for (const speed of [1000, 4000, 8000]) {
      const slope = (distanceCoefficient(0.01) - distanceCoefficient(0)) / 0.01;
      const start = (slope * flingDistance(speed)) / flingDurationSeconds(speed);
      expect(start / speed).toBeGreaterThan(0.99);
      expect(start / speed).toBeLessThan(1.01);
    }
  });

  it('сплайн монотонен и приходит в единицу', () => {
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const value = distanceCoefficient(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(distanceCoefficient(1)).toBeCloseTo(1, 3);
  });

  it('быстрее брошенный бросок улетает дальше и летит дольше', () => {
    expect(flingDistance(8000)).toBeGreaterThan(flingDistance(4000));
    expect(flingDurationSeconds(8000)).toBeGreaterThan(flingDurationSeconds(4000));
  });
});

describe('скорость пальца на отпускании', () => {
  function track(velocity: number, count = 12, stepMs = 8): { t: number; y: number }[] {
    return Array.from({ length: count }, (_, index) => ({
      t: index * stepMs,
      y: (velocity * (index * stepMs)) / 1000,
    }));
  }

  it('возвращает скорость равномерного движения', () => {
    const points = track(-3000);
    const release = points[points.length - 1]!.t;
    expect(fingerVelocity(points, release)).toBeCloseTo(-3000, 0);
  });

  it('считает ноль, если палец замер перед отпусканием', () => {
    const points = track(-3000);
    const release = points[points.length - 1]!.t + 100;
    expect(fingerVelocity(points, release)).toBe(0);
  });

  it('считает ноль, когда точек слишком мало', () => {
    expect(fingerVelocity([{ t: 0, y: 0 }, { t: 8, y: -20 }], 8)).toBe(0);
  });
});
