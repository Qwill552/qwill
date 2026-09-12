import type { ReactNode } from 'react';

import styles from './highlight.module.css';

const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

export interface HighlightRange {
  start: number;
  end: number;
}

export function searchWords(query: string): string[] {
  return normalize(query)
    .split(WORD_SEPARATOR)
    .filter((word) => word.length > 0);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

export function highlightRanges(text: string, query: string): HighlightRange[] {
  const words = searchWords(query);
  if (words.length === 0 || text.length === 0) return [];

  const haystack = normalize(text);
  const found: HighlightRange[] = [];

  for (const word of words) {
    let at = haystack.indexOf(word);
    while (at !== -1) {
      const before = at === 0 ? '' : (text[at - 1] ?? '');
      if (before === '' || !WORD_CHAR.test(before)) found.push({ start: at, end: at + word.length });
      at = haystack.indexOf(word, at + 1);
    }
  }

  return mergeRanges(found);
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  if (ranges.length < 2) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightRange[] = [sorted[0]!];
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export function sliceByRanges(
  text: string,
  ranges: HighlightRange[],
  from = 0,
  to = text.length,
): Array<{ value: string; hit: boolean }> {
  const pieces: Array<{ value: string; hit: boolean }> = [];
  let cursor = from;

  for (const range of ranges) {
    if (range.end <= from || range.start >= to) continue;
    const start = Math.max(range.start, from);
    const end = Math.min(range.end, to);
    if (start > cursor) pieces.push({ value: text.slice(cursor, start), hit: false });
    pieces.push({ value: text.slice(start, end), hit: true });
    cursor = end;
  }

  if (cursor < to) pieces.push({ value: text.slice(cursor, to), hit: false });
  return pieces;
}

export function highlight(text: string, query: string): ReactNode {
  const ranges = highlightRanges(text, query);
  if (ranges.length === 0) return text;

  return sliceByRanges(text, ranges).map((piece, index) =>
    piece.hit ? (
      <mark key={index} className={styles.hit}>
        {piece.value}
      </mark>
    ) : (
      piece.value
    ),
  );
}
