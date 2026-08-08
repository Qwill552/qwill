import { useEffect, useState } from 'react';

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

export function loadEmojiIndex(): Promise<EmojiIndex | null> {
  if (!indexPromise) {
    indexPromise = fetch('/emoji/index.json')
      .then((res) => (res.ok ? (res.json() as Promise<RawEmojiIndex>) : null))
      .then((raw) => {
        if (!raw) return null;
        const byChar = new Map(raw.emoji.map((entry) => [entry.e, entry]));
        return { ...raw, byChar };
      })
      .catch(() => null);
  }
  return indexPromise;
}

export function useEmojiIndex(): EmojiIndex | null | undefined {
  const [index, setIndex] = useState<EmojiIndex | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadEmojiIndex().then((loaded) => {
      if (alive) setIndex(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  return index;
}
