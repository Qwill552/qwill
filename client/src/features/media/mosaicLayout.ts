export interface MosaicRow {
  indexes: number[];
  weight: number;
}

export interface MosaicLayout {
  rows: MosaicRow[];
  ratio: number;
}

export const MOSAIC_MAX_ITEMS = 10;

const WIDE = 1.2;
const PANORAMIC = 1.6;
const MAX_PER_ROW = 3;
const PANORAMIC_PER_ROW = 2;
const MIN_RATIO = 0.62;
const MAX_RATIO = 1.9;
const MIN_ITEM_RATIO = 0.4;
const MAX_ITEM_RATIO = 2.6;

export function normalizeRatio(ratio: number | null | undefined): number {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(MAX_ITEM_RATIO, Math.max(MIN_ITEM_RATIO, ratio));
}

function evenRows(count: number, maxPerRow: number): number[] {
  const rowCount = Math.ceil(count / maxPerRow);
  const base = Math.floor(count / rowCount);
  let extra = count % rowCount;
  const sizes: number[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    sizes.push(base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
  }
  return sizes;
}

function split(indexes: number[], sizes: number[]): number[][] {
  const rows: number[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    rows.push(indexes.slice(cursor, cursor + size));
    cursor += size;
  }
  return rows;
}

function partition(ratios: number[]): number[][] {
  const indexes = ratios.map((_, index) => index);
  const count = indexes.length;
  if (count <= 1) return [indexes];

  const average = ratios.reduce((sum, ratio) => sum + ratio, 0) / count;
  const wide = average >= WIDE;
  const panoramic = average >= PANORAMIC;

  if (count === 2) return wide ? split(indexes, [1, 1]) : [indexes];
  if (count === 3) return wide ? split(indexes, [1, 2]) : [indexes];

  return split(indexes, evenRows(count, panoramic ? PANORAMIC_PER_ROW : MAX_PER_ROW));
}

export function mosaicLayout(sourceRatios: (number | null | undefined)[]): MosaicLayout {
  const ratios = sourceRatios.map(normalizeRatio);
  const groups = partition(ratios);
  const heights = groups.map((indexes) => 1 / indexes.reduce((sum, index) => sum + normalizeRatio(ratios[index]), 0));
  const height = heights.reduce((sum, value) => sum + value, 0);

  const rows = groups.map((indexes, index) => ({ indexes, weight: (heights[index] ?? 0) / height }));
  return { rows, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, 1 / height)) };
}
