import type { AvatarColor, ChatType } from '@messenger/shared';
import { create } from 'zustand';

const LEGACY_STORAGE_KEY = 'messenger.recentSearches';
const STORAGE_PREFIX = 'messenger.recentSearches:';
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

function storageKeyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function parseStored(raw: string | null): RecentSearchEntry[] {
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

function readFor(userId: string): RecentSearchEntry[] {
  const key = storageKeyFor(userId);
  const own = localStorage.getItem(key);
  if (own !== null) return parseStored(own);
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === null) return [];
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  const migrated = parseStored(legacy);
  if (migrated.length > 0) localStorage.setItem(key, JSON.stringify(migrated));
  return migrated;
}

function persist(userId: string | null, entries: RecentSearchEntry[]): void {
  if (userId === null) return;
  localStorage.setItem(storageKeyFor(userId), JSON.stringify(entries));
}

function removeAllStored(): void {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && (key === LEGACY_STORAGE_KEY || key.startsWith(STORAGE_PREFIX))) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

interface RecentSearchState {
  userId: string | null;
  entries: RecentSearchEntry[];
  setUser: (userId: string | null) => void;
  remember: (entry: RecentSearchEntry) => void;
  forget: (key: string) => void;
  clear: () => void;
}

export const useRecentSearchStore = create<RecentSearchState>((set, get) => ({
  userId: null,
  entries: [],

  setUser(userId) {
    if (get().userId === userId) return;
    set({ userId, entries: userId === null ? [] : readFor(userId) });
  },

  remember(entry) {
    const key = recentSearchKey(entry);
    const entries = [entry, ...get().entries.filter((item) => recentSearchKey(item) !== key)].slice(0, LIMIT);
    persist(get().userId, entries);
    set({ entries });
  },

  forget(key) {
    const entries = get().entries.filter((item) => recentSearchKey(item) !== key);
    persist(get().userId, entries);
    set({ entries });
  },

  clear() {
    removeAllStored();
    set({ userId: null, entries: [] });
  },
}));
