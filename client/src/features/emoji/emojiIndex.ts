import { useSyncExternalStore } from 'react';

export const EMOJI_SHEET_URL = '/emoji/sheet.webp';

export interface EmojiEntry {
  e: string;
  x: number;
  y: number;
  c: number;
  k: string[];
}

export interface EmojiIndex {
  cell: number;
  cols: number;
  rows: number;
  categories: string[];
  emoji: EmojiEntry[];
  byChar: Map<string, EmojiEntry>;
}

interface RawEmojiIndex {
  cell: number;
  cols: number;
  rows: number;
  categories: string[];
  emoji: EmojiEntry[];
}

let indexPromise: Promise<EmojiIndex | null> | null = null;
let loadedIndex: EmojiIndex | null | undefined;
const subscribers = new Set<() => void>();

export function loadEmojiIndex(): Promise<EmojiIndex | null> {
  if (!indexPromise) {
    indexPromise = fetch('/emoji/index.json')
      .then((res) => (res.ok ? (res.json() as Promise<RawEmojiIndex>) : null))
      .then((raw) => {
        if (!raw) return null;
        const byChar = new Map(raw.emoji.map((entry) => [entry.e, entry]));
        return { ...raw, byChar };
      })
      .catch(() => null)
      .then((index) => {
        loadedIndex = index;
        for (const notify of subscribers) notify();
        return index;
      });
  }
  return indexPromise;
}

export function warmEmojiAssets(): void {
  void loadEmojiIndex();
  if (typeof Image === 'undefined') return;
  const sheet = new Image();
  sheet.src = EMOJI_SHEET_URL;
}

function subscribeToEmojiIndex(notify: () => void): () => void {
  void loadEmojiIndex();
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

function readEmojiIndex(): EmojiIndex | null | undefined {
  return loadedIndex;
}

export function useEmojiIndex(): EmojiIndex | null | undefined {
  return useSyncExternalStore(subscribeToEmojiIndex, readEmojiIndex, readEmojiIndex);
}
