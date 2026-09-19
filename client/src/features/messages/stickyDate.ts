import type { FeedHeightTable } from './feedHeights';
import { indexAtOffset, rowTop } from './feedHeights';

export interface StickyDate {
  topIndex: number;
  dayIndex: number;
  offset: number;
}

export function stickyDate(
  table: FeedHeightTable,
  showDay: (index: number) => boolean,
  clip: number,
  dividerHeight: number,
): StickyDate | null {
  if (table.count === 0) return null;

  const topIndex = indexAtOffset(table, clip);
  let dayIndex = topIndex;
  while (dayIndex > 0 && !showDay(dayIndex)) dayIndex -= 1;
  if (!showDay(dayIndex) || rowTop(table, dayIndex) > clip) return null;

  let offset = 0;
  for (let next = topIndex + 1; next < table.count; next += 1) {
    if (!showDay(next)) continue;
    const gap = rowTop(table, next) - clip;
    if (gap < dividerHeight) offset = gap - dividerHeight;
    break;
  }

  return { topIndex, dayIndex, offset };
}
