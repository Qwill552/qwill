import { describe, expect, it } from 'vitest';

import { buildHeightTable, EMPTY_HEIGHT_TABLE } from './feedHeights';
import { stickyDate } from './stickyDate';

const ROW = 100;
const DIVIDER = 38;
const DAYS = new Set([0, 5]);

const table = buildHeightTable(
  Array.from({ length: 10 }, (_, index) => index),
  new Map(Array.from({ length: 10 }, (_, index) => [index, ROW] as const)),
);

function at(clip: number) {
  return stickyDate(table, (index) => DAYS.has(index), clip, DIVIDER);
}

describe('stickyDate', () => {
  it('нет строк — нет пилюли', () => {
    expect(stickyDate(EMPTY_HEIGHT_TABLE, () => true, 0, DIVIDER)).toBeNull();
  });

  it('в самом верху ленты пилюля уже стоит на линии', () => {
    expect(at(0)).toEqual({ topIndex: 0, dayIndex: 0, offset: 0 });
  });

  it('пока следующий день дальше своей высоты — пилюля не сдвинута', () => {
    expect(at(450)?.offset).toBe(0);
    expect(at(ROW * 5 - DIVIDER)?.offset).toBe(0);
  });

  it('подъезжающий день выталкивает пилюлю ровно на её высоту', () => {
    expect(at(470)?.offset).toBe(-8);
    expect(at(499)?.offset).toBe(-37);
  });

  it('передача происходит на линии: новый день встаёт туда же, откуда ушёл старый', () => {
    expect(at(499)).toEqual({ topIndex: 4, dayIndex: 0, offset: -37 });
    expect(at(500)).toEqual({ topIndex: 5, dayIndex: 5, offset: 0 });
  });

  it('пилюля не пропадает ни в одном положении прокрутки', () => {
    for (let clip = 0; clip <= ROW * 10 - 1; clip += 1) {
      expect(at(clip), `clip=${clip}`).not.toBeNull();
    }
  });

  it('разделитель ушедшего за верх дня остаётся тем же самым', () => {
    for (let clip = 500; clip <= 900; clip += 1) {
      expect(at(clip)?.dayIndex, `clip=${clip}`).toBe(5);
    }
  });
});
