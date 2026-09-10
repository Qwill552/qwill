import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildHeightTable,
  FEED_HEIGHT_CHATS_LIMIT,
  FEED_ROW_ESTIMATE,
  FEED_SKELETON_ROWS,
  forgetAllHeights,
  forgetHeights,
  heightsOf,
  indexAtOffset,
  rangeHeight,
  rowHeight,
  rowTop,
  skeletonsAbove,
  skeletonsBelow,
  totalHeight,
  windowAround,
  windowAtEnd,
  windowAtOffset,
  type FeedRowKey,
} from './feedHeights';

function keys(count: number): FeedRowKey[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function measured(entries: Record<number, number>): Map<FeedRowKey, number> {
  return new Map<FeedRowKey, number>(Object.entries(entries).map(([key, height]) => [Number(key), height]));
}

describe('таблица высот ленты', () => {
  it('префиксные суммы складывают измеренные высоты', () => {
    const table = buildHeightTable(keys(3), measured({ 1: 10, 2: 20, 3: 30 }));

    expect(table.prefix).toEqual([0, 10, 30, 60]);
    expect(totalHeight(table)).toBe(60);
    expect(rowTop(table, 0)).toBe(0);
    expect(rowTop(table, 2)).toBe(30);
    expect(rowHeight(table, 1)).toBe(20);
    expect(rangeHeight(table, 1, 2)).toBe(50);
  });

  it('неизмеренная строка берёт бегущее среднее измеренных', () => {
    const table = buildHeightTable(keys(4), measured({ 1: 10, 3: 30 }));

    expect(table.average).toBe(20);
    expect(rowHeight(table, 1)).toBe(20);
    expect(totalHeight(table)).toBe(80);
  });

  it('без единого замера строка считается по умолчанию', () => {
    const table = buildHeightTable(keys(3), new Map());

    expect(table.average).toBe(FEED_ROW_ESTIMATE);
    expect(totalHeight(table)).toBe(FEED_ROW_ESTIMATE * 3);
  });

  it('пустая лента не даёт ни высоты, ни окна', () => {
    const table = buildHeightTable([], new Map());

    expect(totalHeight(table)).toBe(0);
    expect(windowAtOffset(table, 0, 600, 80)).toEqual({ from: 0, to: -1 });
    expect(windowAtEnd(table, 80)).toEqual({ from: 0, to: -1 });
  });
});

describe('поиск строки по смещению', () => {
  const table = buildHeightTable(keys(4), measured({ 1: 10, 2: 20, 3: 30, 4: 40 }));

  it('смещение внутри строки даёт её индекс', () => {
    expect(indexAtOffset(table, 0)).toBe(0);
    expect(indexAtOffset(table, 9)).toBe(0);
    expect(indexAtOffset(table, 10)).toBe(1);
    expect(indexAtOffset(table, 29)).toBe(1);
    expect(indexAtOffset(table, 30)).toBe(2);
    expect(indexAtOffset(table, 60)).toBe(3);
  });

  it('за краями лента отдаёт крайние строки', () => {
    expect(indexAtOffset(table, -500)).toBe(0);
    expect(indexAtOffset(table, 5000)).toBe(3);
  });
});

describe('окно от позиции прокрутки', () => {
  const table = buildHeightTable(keys(200), new Map());
  const rowsPerScreen = 600 / FEED_ROW_ESTIMATE;

  it('окно захватывает по два с половиной экрана в каждую сторону', () => {
    const win = windowAtOffset(table, FEED_ROW_ESTIMATE * 100, 600, 200);

    expect(win.from).toBe(indexAtOffset(table, FEED_ROW_ESTIMATE * 100 - 600 * 2.5));
    expect(win.to).toBe(indexAtOffset(table, FEED_ROW_ESTIMATE * 100 + 600 + 600 * 2.5));
    expect(win.to - win.from + 1).toBeGreaterThan(rowsPerScreen);
  });

  it('потолок строк не превышается и кадр остаётся внутри окна', () => {
    const top = FEED_ROW_ESTIMATE * 100;
    const win = windowAtOffset(table, top, 600, 40);

    expect(win.to - win.from + 1).toBe(40);
    expect(win.from).toBeLessThanOrEqual(indexAtOffset(table, top));
    expect(win.to).toBeGreaterThanOrEqual(indexAtOffset(table, top + 600));
  });

  it('у краёв ленты окно упирается в края, а не вылезает за них', () => {
    const top = windowAtOffset(table, 0, 600, 80);
    expect(top.from).toBe(0);

    const bottomTop = totalHeight(table) - 600;
    const bottom = windowAtOffset(table, bottomTop, 600, 80);
    expect(bottom.to).toBe(199);
    expect(bottom.from).toBe(indexAtOffset(table, bottomTop - 600 * 2.5));
  });

  it('окно вокруг строки и окно у хвоста держат тот же потолок', () => {
    expect(windowAround(table, 100, 80)).toEqual({ from: 60, to: 139 });
    expect(windowAround(table, 0, 80)).toEqual({ from: 0, to: 79 });
    expect(windowAround(table, 199, 80)).toEqual({ from: 120, to: 199 });
    expect(windowAtEnd(table, 80)).toEqual({ from: 120, to: 199 });
  });
});

describe('заготовки вокруг окна', () => {
  const table = buildHeightTable(keys(200), new Map());

  it('сорок строк сверху и снизу, не выходя за ленту', () => {
    expect(skeletonsAbove({ from: 100, to: 150 })).toEqual({ from: 100 - FEED_SKELETON_ROWS, to: 99 });
    expect(skeletonsBelow(table, { from: 100, to: 150 })).toEqual({ from: 151, to: 150 + FEED_SKELETON_ROWS });
  });

  it('у краёв ленты заготовок нет', () => {
    expect(skeletonsAbove({ from: 0, to: 80 })).toEqual({ from: 0, to: -1 });
    expect(skeletonsBelow(table, { from: 120, to: 199 })).toEqual({ from: 200, to: 199 });
  });
});

describe('замеры по чатам', () => {
  beforeEach(() => {
    forgetAllHeights();
  });

  it('замеры чата переживают переход в другой чат и обратно', () => {
    heightsOf('a').set(1, 42);
    heightsOf('b').set(1, 17);

    expect(heightsOf('a').get(1)).toBe(42);
    expect(heightsOf('b').get(1)).toBe(17);
  });

  it('самый давний чат вытесняется по потолку', () => {
    for (let i = 0; i < FEED_HEIGHT_CHATS_LIMIT; i += 1) heightsOf(`chat-${i}`).set(1, i);
    heightsOf('chat-0');
    heightsOf('fresh').set(1, 1);

    expect(heightsOf('chat-0').get(1)).toBe(0);
    expect(heightsOf('chat-1').size).toBe(0);
  });

  it('чат забывается вместе со своими замерами', () => {
    heightsOf('a').set(1, 42);
    forgetHeights('a');

    expect(heightsOf('a').size).toBe(0);
  });
});
