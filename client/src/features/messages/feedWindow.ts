export const FEED_PAGE_SIZE = 50;
export const FEED_WINDOW_LIMIT = FEED_PAGE_SIZE * 3;

export type FeedSide = 'older' | 'newer';

export interface FeedItem {
  id: number;
}

export interface FeedKeepRange {
  keepFromId: number;
  keepToId: number;
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
