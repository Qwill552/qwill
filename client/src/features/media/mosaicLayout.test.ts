import { describe, expect, it } from 'vitest';

import { mosaicLayout } from './mosaicLayout';

function square(count: number): number[] {
  return Array.from({ length: count }, () => 1);
}

function sizes(ratios: (number | null)[]): number[] {
  return mosaicLayout(ratios).rows.map((row) => row.indexes.length);
}

describe('mosaicLayout', () => {
  it('каждая плитка попадает ровно в одну строку', () => {
    for (let count = 1; count <= 10; count += 1) {
      const flat = mosaicLayout(square(count)).rows.flatMap((row) => row.indexes);
      expect([...flat].sort((a, b) => a - b)).toEqual(square(count).map((_, index) => index));
    }
  });

  it('в строке не больше трёх плиток', () => {
    for (let count = 1; count <= 10; count += 1) {
      expect(Math.max(...sizes(square(count)))).toBeLessThanOrEqual(3);
    }
  });

  it('две широких фотографии кладёт друг под друга, две вертикальных — рядом', () => {
    expect(sizes([1.8, 1.6])).toEqual([1, 1]);
    expect(sizes([0.7, 0.75])).toEqual([2]);
  });

  it('три фотографии: широкая сверху и две под ней либо все три в ряд', () => {
    expect(sizes([1.9, 1.7, 1.5])).toEqual([1, 2]);
    expect(sizes([0.7, 0.8, 0.75])).toEqual([3]);
  });

  it('раскладывает 4, 5 и 10 плиток без остатка', () => {
    expect(sizes(square(4))).toEqual([2, 2]);
    expect(sizes(square(5))).toEqual([3, 2]);
    expect(sizes(square(10))).toEqual([3, 3, 2, 2]);
  });

  it('вес строки обратно пропорционален сумме пропорций её плиток', () => {
    const layout = mosaicLayout([1, 1, 1, 1]);
    expect(layout.rows[0]?.weight).toBeCloseTo(0.5);
    expect(layout.rows[1]?.weight).toBeCloseTo(0.5);
    expect(layout.ratio).toBeCloseTo(1);
  });

  it('пропорции без размеров считает квадратными', () => {
    expect(sizes([null, null])).toEqual([2]);
    expect(mosaicLayout([null]).ratio).toBeCloseTo(1);
  });

  it('держит общую пропорцию в разумных границах', () => {
    for (let count = 1; count <= 10; count += 1) {
      const { ratio } = mosaicLayout(Array.from({ length: count }, () => 0.3));
      expect(ratio).toBeGreaterThanOrEqual(0.62);
      expect(ratio).toBeLessThanOrEqual(1.9);
    }
  });
});
