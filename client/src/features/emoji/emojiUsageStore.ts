import { create } from 'zustand';

const STORAGE_KEY = 'messenger.recentEmoji';
const MAX_RECENT = 48;

function readStored(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

interface EmojiUsageState {
  recent: string[];
  recordUsage: (emoji: string) => void;
}

export const useEmojiUsageStore = create<EmojiUsageState>((set, get) => ({
  recent: readStored(),

  recordUsage(emoji) {
    const next = [emoji, ...get().recent.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ recent: next });
  },
}));
