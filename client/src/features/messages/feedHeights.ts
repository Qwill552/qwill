import type { FeedSlice } from './feedWindow';

export type FeedRowKey = string | number;

export const FEED_ROW_ESTIMATE = 56;
export const FEED_WINDOW_SCREENS = 2.5;
export const FEED_SKELETON_ROWS = 40;
export const FEED_HEIGHT_CHATS_LIMIT = 20;

export interface FeedHeightTable {
  count: number;
  average: number;
  prefix: number[];
}

export const EMPTY_HEIGHT_TABLE: FeedHeightTable = { count: 0, average: FEED_ROW_ESTIMATE, prefix: [0] };

export function buildHeightTable(
  keys: readonly FeedRowKey[],
  measured: ReadonlyMap<FeedRowKey, number>,
): FeedHeightTable {
  let known = 0;
  let sum = 0;
  for (const key of keys) {
    const height = measured.get(key);
    if (height === undefined) continue;
    known += 1;
    sum += height;
  }

  const average = known === 0 ? FEED_ROW_ESTIMATE : sum / known;
  const prefix: number[] = new Array<number>(keys.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < keys.length; i += 1) {
    prefix[i + 1] = prefix[i]! + (measured.get(keys[i]!) ?? average);
  }

  return { count: keys.length, average, prefix };
}

export function totalHeight(table: FeedHeightTable): number {
  return table.prefix[table.count]!;
}

export function rowTop(table: FeedHeightTable, index: number): number {
  if (index <= 0) return 0;
  if (index >= table.count) return totalHeight(table);
  return table.prefix[index]!;
}

export function rowHeight(table: FeedHeightTable, index: number): number {
  if (index < 0 || index >= table.count) return 0;
  return table.prefix[index + 1]! - table.prefix[index]!;
}

export function rangeHeight(table: FeedHeightTable, from: number, to: number): number {
  if (to < from) return 0;
  return rowTop(table, to + 1) - rowTop(table, from);
}

export function indexAtOffset(table: FeedHeightTable, offset: number): number {
  if (table.count === 0) return 0;
  if (offset <= 0) return 0;
  if (offset >= totalHeight(table)) return table.count - 1;

  let low = 0;
  let high = table.count - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (table.prefix[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

function fitToLimit(table: FeedHeightTable, from: number, to: number, center: number, limit: number): FeedSlice {
  if (to - from + 1 <= limit) return { from, to };

  const half = Math.floor(limit / 2);
  let start = Math.max(from, center - half);
  start = Math.min(start, table.count - limit);
  start = Math.max(0, start);
  return { from: start, to: Math.min(to, start + limit - 1) };
}

export function windowAtOffset(
  table: FeedHeightTable,
  top: number,
  viewport: number,
  limit: number,
): FeedSlice {
  if (table.count === 0) return { from: 0, to: -1 };

  const buffer = viewport * FEED_WINDOW_SCREENS;
  const from = indexAtOffset(table, top - buffer);
  const to = indexAtOffset(table, top + viewport + buffer);
  return fitToLimit(table, from, to, indexAtOffset(table, top + viewport / 2), limit);
}

export function windowAround(table: FeedHeightTable, index: number, limit: number): FeedSlice {
  if (table.count === 0) return { from: 0, to: -1 };
  return fitToLimit(table, 0, table.count - 1, Math.max(0, Math.min(index, table.count - 1)), limit);
}

export function windowAtEnd(table: FeedHeightTable, limit: number): FeedSlice {
  if (table.count === 0) return { from: 0, to: -1 };
  return { from: Math.max(0, table.count - limit), to: table.count - 1 };
}

export function skeletonsAbove(win: FeedSlice): FeedSlice {
  return { from: Math.max(0, win.from - FEED_SKELETON_ROWS), to: win.from - 1 };
}

export function skeletonsBelow(table: FeedHeightTable, win: FeedSlice): FeedSlice {
  return { from: win.to + 1, to: Math.min(table.count - 1, win.to + FEED_SKELETON_ROWS) };
}

export function sameWindow(a: FeedSlice, b: FeedSlice): boolean {
  return a.from === b.from && a.to === b.to;
}

const measuredByChat = new Map<string, Map<FeedRowKey, number>>();

export function heightsOf(chatId: string): Map<FeedRowKey, number> {
  const known = measuredByChat.get(chatId);
  if (known) {
    measuredByChat.delete(chatId);
    measuredByChat.set(chatId, known);
    return known;
  }

  const fresh = new Map<FeedRowKey, number>();
  measuredByChat.set(chatId, fresh);
  while (measuredByChat.size > FEED_HEIGHT_CHATS_LIMIT) {
    const oldest = measuredByChat.keys().next().value;
    if (oldest === undefined) break;
    measuredByChat.delete(oldest);
  }
  return fresh;
}

export function forgetHeights(chatId: string): void {
  measuredByChat.delete(chatId);
}

export function forgetAllHeights(): void {
  measuredByChat.clear();
}
