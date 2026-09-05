export const FEED_PAGE_SIZE = 50;
export const FEED_ACCUMULATOR_LIMIT = 1000;
export const FEED_SLICE_LIMIT = 120;
export const FEED_SLICE_STEP = 30;
export const FEED_PREFETCH_MARGIN = 100;

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

function rank(id: number): number {
  return id < 0 ? Number.POSITIVE_INFINITY : id;
}

function indexAtOrAfter<T extends FeedItem>(list: T[], id: number): number {
  const wanted = rank(id);
  for (let i = 0; i < list.length; i += 1) {
    if (rank(list[i]!.id) >= wanted) return i;
  }
  return list.length - 1;
}

function indexAtOrBefore<T extends FeedItem>(list: T[], id: number): number {
  const wanted = rank(id);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (rank(list[i]!.id) <= wanted) return i;
  }
  return 0;
}

function boundsFor<T extends FeedItem>(list: T[], from: number, to: number): FeedBounds {
  return {
    fromId: from <= 0 ? null : list[from]!.id,
    toId: to >= list.length - 1 ? null : list[to]!.id,
  };
}

export function clampBounds<T extends FeedItem>(list: T[], bounds: FeedBounds, limit: number): FeedSlice {
  if (list.length === 0) return { from: 0, to: -1 };

  const last = list.length - 1;
  let from = bounds.fromId === null ? 0 : indexAtOrAfter(list, bounds.fromId);
  let to = bounds.toId === null ? last : indexAtOrBefore(list, bounds.toId);
  if (to < from) to = from;
  if (to - from + 1 <= limit) return { from, to };

  if (bounds.fromId === null && bounds.toId === null) {
    from = last - limit + 1;
    to = last;
  } else if (bounds.fromId === null) {
    to = from + limit - 1;
  } else {
    from = to - limit + 1;
  }
  return { from, to };
}

export function tailBounds<T extends FeedItem>(list: T[], limit: number): FeedBounds {
  if (list.length === 0) return { fromId: null, toId: null };
  return boundsFor(list, Math.max(0, list.length - limit), list.length - 1);
}

export function boundsAround<T extends FeedItem>(list: T[], messageId: number, limit: number): FeedBounds {
  if (list.length === 0) return { fromId: null, toId: null };

  const index = list.findIndex((item) => item.id === messageId);
  if (index === -1) return tailBounds(list, limit);

  const to = Math.min(list.length - 1, Math.max(0, index - Math.floor(limit / 2)) + limit - 1);
  return boundsFor(list, Math.max(0, to - limit + 1), to);
}

export function shiftBounds<T extends FeedItem>(
  list: T[],
  bounds: FeedBounds,
  side: FeedSide,
  step: number,
  limit: number,
): FeedBounds {
  if (list.length === 0) return bounds;

  const slice = clampBounds(list, bounds, limit);
  let { from, to } = slice;
  if (side === 'older') {
    from = Math.max(0, from - step);
    if (to - from + 1 > limit) to = from + limit - 1;
  } else {
    to = Math.min(list.length - 1, to + step);
    if (to - from + 1 > limit) from = to - limit + 1;
  }
  return boundsFor(list, from, to);
}

export function sameBounds(a: FeedBounds, b: FeedBounds): boolean {
  return a.fromId === b.fromId && a.toId === b.toId;
}
