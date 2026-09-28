import { create } from 'zustand';

const STORAGE_PREFIX = 'messenger.hiddenPins:';

type HiddenPins = Record<string, number>;

function storageKeyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readFor(userId: string): HiddenPins {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKeyFor(userId)) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    );
  } catch {
    return {};
  }
}

function persist(userId: string | null, pins: HiddenPins): void {
  if (userId === null) return;
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(pins));
  } catch {
    return;
  }
}

function removeAllStored(): void {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && key.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

interface HiddenPinsState {
  userId: string | null;
  pins: HiddenPins;
  setUser: (userId: string | null) => void;
  hide: (chatId: string, messageId: number) => void;
  clear: () => void;
}

export function isPinHidden(pins: HiddenPins, chatId: string, messageId: number): boolean {
  return pins[chatId] === messageId;
}

export const useHiddenPinsStore = create<HiddenPinsState>((set, get) => ({
  userId: null,
  pins: {},

  setUser(userId) {
    if (get().userId === userId) return;
    set({ userId, pins: userId === null ? {} : readFor(userId) });
  },

  hide(chatId, messageId) {
    const pins = { ...get().pins, [chatId]: messageId };
    persist(get().userId, pins);
    set({ pins });
  },

  clear() {
    removeAllStored();
    set({ userId: null, pins: {} });
  },
}));
