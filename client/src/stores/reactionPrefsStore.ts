import { DEFAULT_DOUBLE_TAP_REACTION, DEFAULT_QUICK_REACTIONS } from '@messenger/shared';
import { create } from 'zustand';

const QUICK_KEY = 'messenger.quickReactions';
const DOUBLE_TAP_KEY = 'messenger.doubleTapReaction';

function parseStoredQuickReactions(stored: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((v) => typeof v === 'string')) return parsed;
    return null;
  } catch {
    return null;
  }
}

function readQuickReactions(): string[] {
  const stored = localStorage.getItem(QUICK_KEY);
  const parsed = stored ? parseStoredQuickReactions(stored) : null;
  return parsed ?? [...DEFAULT_QUICK_REACTIONS];
}

function readDoubleTapReaction(): string {
  return localStorage.getItem(DOUBLE_TAP_KEY) || DEFAULT_DOUBLE_TAP_REACTION;
}

interface ReactionPrefsState {
  quickReactions: string[];
  doubleTapReaction: string;
  setQuickReactions: (emojis: string[]) => void;
  setDoubleTapReaction: (emoji: string) => void;
}

export const useReactionPrefsStore = create<ReactionPrefsState>((set) => ({
  quickReactions: readQuickReactions(),
  doubleTapReaction: readDoubleTapReaction(),

  setQuickReactions(emojis) {
    localStorage.setItem(QUICK_KEY, JSON.stringify(emojis));
    set({ quickReactions: emojis });
  },

  setDoubleTapReaction(emoji) {
    localStorage.setItem(DOUBLE_TAP_KEY, emoji);
    set({ doubleTapReaction: emoji });
  },
}));
