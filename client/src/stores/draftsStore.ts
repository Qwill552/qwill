import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { create } from 'zustand';

const STORAGE_PREFIX = 'messenger.drafts:';

export interface ChatDraft {
  text: string;
  replyTo: MessageDto | null;
  date: number;
}

export type Drafts = Record<string, ChatDraft>;

export function isEmptyDraft(draft: Pick<ChatDraft, 'text' | 'replyTo'>): boolean {
  return draft.text.trim().length === 0 && draft.replyTo === null;
}

export function nextDrafts(drafts: Drafts, chatId: string, text: string, replyTo: MessageDto | null, now: number): Drafts {
  const previous = drafts[chatId];
  if (isEmptyDraft({ text, replyTo })) {
    if (!previous) return drafts;
    const rest = { ...drafts };
    delete rest[chatId];
    return rest;
  }
  if (previous && previous.text === text && (previous.replyTo?.id ?? null) === (replyTo?.id ?? null)) return drafts;
  return { ...drafts, [chatId]: { text, replyTo, date: now } };
}

export function shownDraft(chat: ChatListItemDto, draft: ChatDraft | undefined): ChatDraft | null {
  if (!draft || isEmptyDraft(draft)) return null;
  const lastAt = chat.lastMessage ? Date.parse(chat.lastMessage.createdAt) : 0;
  if (lastAt > draft.date && chat.unreadCount > 0) return null;
  return draft;
}

export function chatSortTime(chat: ChatListItemDto, draft: ChatDraft | undefined): number {
  const updated = Date.parse(chat.updatedAt) || 0;
  const drafted = draft && !isEmptyDraft(draft) ? draft.date : 0;
  return Math.max(updated, drafted);
}

function storageKeyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function isDraft(value: unknown): value is ChatDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<ChatDraft>;
  return typeof draft.text === 'string' && typeof draft.date === 'number' && (draft.replyTo === null || typeof draft.replyTo === 'object');
}

function readFor(userId: string): Drafts {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKeyFor(userId)) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, ChatDraft] => isDraft(entry[1])));
  } catch {
    return {};
  }
}

function persist(userId: string | null, drafts: Drafts): void {
  if (userId === null) return;
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(drafts));
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

interface DraftsState {
  userId: string | null;
  drafts: Drafts;
  setUser: (userId: string | null) => void;
  save: (chatId: string, text: string, replyTo: MessageDto | null) => void;
  remove: (chatId: string) => void;
  clear: () => void;
}

export const useDraftsStore = create<DraftsState>((set, get) => ({
  userId: null,
  drafts: {},

  setUser(userId) {
    if (get().userId === userId) return;
    set({ userId, drafts: userId === null ? {} : readFor(userId) });
  },

  save(chatId, text, replyTo) {
    const current = get().drafts;
    const drafts = nextDrafts(current, chatId, text, replyTo, Date.now());
    if (drafts === current) return;
    persist(get().userId, drafts);
    set({ drafts });
  },

  remove(chatId) {
    const current = get().drafts;
    if (!(chatId in current)) return;
    const drafts = { ...current };
    delete drafts[chatId];
    persist(get().userId, drafts);
    set({ drafts });
  },

  clear() {
    removeAllStored();
    set({ userId: null, drafts: {} });
  },
}));
