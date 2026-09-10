export const FEED_PAGE_SIZE = 50;
export const FEED_ACCUMULATOR_LIMIT = 1000;
export const FEED_SLICE_LIMIT = 80;
export const FEED_PREFETCH_MARGIN = 100;
export const FEED_SENSITIVE_AREA_PX = 800;
export const FEED_RETRY_MS = 4000;

export type FeedSide = 'older' | 'newer';

export interface FeedItem {
  id: number;
}

export interface FeedKeepRange {
  keepFromId: number;
  keepToId: number;
}

export interface FeedBounds {
  fromId: number | null;
  toId: number | null;
}

export interface FeedSlice {
  from: number;
  to: number;
}

export interface FeedTrimResult<T extends FeedItem> {
  list: T[];
  trimmed: boolean;
}

export function mergeFeedPage<T extends FeedItem>(list: T[], page: T[], side: FeedSide): T[] {
  const known = new Set(list.map((item) => item.id));
  const fresh = page.filter((item) => !known.has(item.id));
  if (fresh.length === 0) return list;
  if (side === 'older') return [...fresh, ...list];

  const settled = list.filter((item) => item.id > 0);
  const pending = list.filter((item) => item.id < 0);
  return [...settled, ...fresh, ...pending];
}

export function trimFeedWindow<T extends FeedItem>(
  list: T[],
  loaded: FeedSide,
  limit: number,
  keep: FeedKeepRange | null,
): FeedTrimResult<T> {
  const excess = list.length - limit;
  if (keep === null || excess <= 0) return { list, trimmed: false };

  let cut = 0;
  if (loaded === 'older') {
    while (cut < excess) {
      const item = list[list.length - 1 - cut];
      if (!item || item.id < 0 || item.id <= keep.keepToId) break;
      cut += 1;
    }
    return cut === 0 ? { list, trimmed: false } : { list: list.slice(0, list.length - cut), trimmed: true };
  }

  while (cut < excess) {
    const item = list[cut];
    if (!item || item.id >= keep.keepFromId) break;
    cut += 1;
  }
  return cut === 0 ? { list, trimmed: false } : { list: list.slice(cut), trimmed: true };
}

export function selectDeletedRows<Row, T extends FeedItem>(
  rows: Row[],
  list: T[],
  messageIdsOf: (row: Row) => number[],
): Row[] {
  if (rows.length === 0) return rows;

  const alive = new Set<number>();
  for (const item of list) alive.add(item.id);
  return rows.filter((row) => !messageIdsOf(row).some((id) => alive.has(id)));
}
