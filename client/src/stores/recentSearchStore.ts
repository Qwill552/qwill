import type { AvatarColor, ChatType } from '@messenger/shared';
import { create } from 'zustand';

const STORAGE_KEY = 'messenger.recentSearches';
const LIMIT = 20;

export interface RecentSearchEntry {
  chatId: string | null;
  kind: 'user' | 'chat';
  title: string;
  username: string | null;
  avatarUrl: string | null;
  avatarColor: AvatarColor | null;
  type: ChatType;
  isService: boolean;
}

export function recentSearchKey(entry: Pick<RecentSearchEntry, 'kind' | 'chatId' | 'username'>): string {
  return entry.kind === 'user' ? `user:${entry.username ?? ''}` : `chat:${entry.chatId ?? ''}`;
}

function readStored(): RecentSearchEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentSearchEntry => {
      const candidate = entry as Partial<RecentSearchEntry> | null;
      return (
        (typeof candidate?.chatId === 'string' || candidate?.chatId === null) &&
        typeof candidate?.title === 'string'
      );
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
  forget: (key: string) => void;
}

export const useRecentSearchStore = create<RecentSearchState>((set, get) => ({
  entries: readStored(),

  remember(entry) {
    const key = recentSearchKey(entry);
    const entries = [entry, ...get().entries.filter((item) => recentSearchKey(item) !== key)].slice(0, LIMIT);
    persist(entries);
    set({ entries });
  },

  forget(key) {
    const entries = get().entries.filter((item) => recentSearchKey(item) !== key);
    persist(entries);
    set({ entries });
  },
}));
