import type { AvatarColor, ChatType } from '@messenger/shared';
import { create } from 'zustand';

const STORAGE_KEY = 'messenger.recentSearches';
const LIMIT = 20;

export interface RecentSearchEntry {
  chatId: string;
  kind: 'user' | 'chat';
  title: string;
  username: string | null;
  avatarUrl: string | null;
  avatarColor: AvatarColor | null;
  type: ChatType;
  isService: boolean;
}

function readStored(): RecentSearchEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentSearchEntry => {
      const candidate = entry as Partial<RecentSearchEntry> | null;
      return typeof candidate?.chatId === 'string' && typeof candidate.title === 'string';
    });
  } catch {
    return [];
  }
}

function persist(entries: RecentSearchEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

interface RecentSearchState {
  entries: RecentSearchEntry[];
  remember: (entry: RecentSearchEntry) => void;
  forget: (chatId: string) => void;
}

export const useRecentSearchStore = create<RecentSearchState>((set, get) => ({
  entries: readStored(),

  remember(entry) {
    const entries = [entry, ...get().entries.filter((item) => item.chatId !== entry.chatId)].slice(0, LIMIT);
    persist(entries);
    set({ entries });
  },

  forget(chatId) {
    const entries = get().entries.filter((item) => item.chatId !== chatId);
    persist(entries);
    set({ entries });
  },
}));
