import type { EmojiEntry } from './emojiIndex';

export interface EmojiSection {
  label: string;
  entries: EmojiEntry[];
}

export interface HeaderRow {
  kind: 'header';
  label: string;
  sectionIndex: number;
}

export interface EmojiRow {
  kind: 'emoji';
  entries: EmojiEntry[];
  sectionIndex: number;
}

export type LayoutRow = HeaderRow | EmojiRow;

export interface EmojiLayout {
  rows: LayoutRow[];
  offsets: number[];
  totalHeight: number;
  sectionAnchorRow: number[];
}

export const EMOJI_COLS = 8;
export const EMOJI_CELL_PX = 44;
export const EMOJI_HEADER_PX = 32;

export function buildEmojiLayout(sections: EmojiSection[]): EmojiLayout {
  const rows: LayoutRow[] = [];
  const offsets: number[] = [];
  const sectionAnchorRow: number[] = [];
  let y = 0;

  sections.forEach((section, sectionIndex) => {
    sectionAnchorRow[sectionIndex] = rows.length;

    if (section.label) {
      rows.push({ kind: 'header', label: section.label, sectionIndex });
      offsets.push(y);
      y += EMOJI_HEADER_PX;
    }

    for (let i = 0; i < section.entries.length; i += EMOJI_COLS) {
      rows.push({ kind: 'emoji', entries: section.entries.slice(i, i + EMOJI_COLS), sectionIndex });
      offsets.push(y);
      y += EMOJI_CELL_PX;
    }
  });

  return { rows, offsets, totalHeight: y, sectionAnchorRow };
}
