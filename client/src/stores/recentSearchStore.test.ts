import { beforeEach, describe, expect, it } from 'vitest';

import { recentSearchKey, useRecentSearchStore, type RecentSearchEntry } from './recentSearchStore';

const STORAGE_KEY = 'messenger.recentSearches';

function personEntry(overrides: Partial<RecentSearchEntry> = {}): RecentSearchEntry {
  return {
    chatId: null,
    kind: 'user',
    title: 'Алиса',
    username: 'alice',
    avatarUrl: null,
    avatarColor: null,
    type: 'PRIVATE',
    isService: false,
    ...overrides,
  };
}

function chatEntry(overrides: Partial<RecentSearchEntry> = {}): RecentSearchEntry {
  return {
    chatId: 'chat-1',
    kind: 'chat',
    title: 'Группа',
    username: null,
    avatarUrl: null,
    avatarColor: null,
    type: 'GROUP',
    isService: false,
    ...overrides,
  };
}

describe('recentSearchStore (R-12)', () => {
  beforeEach(() => {
    localStorage.clear();
    useRecentSearchStore.setState({ entries: [] });
  });

  it('человек без chatId запоминается и ключуется по username', () => {
    const entry = personEntry();
    useRecentSearchStore.getState().remember(entry);

    const stored = useRecentSearchStore.getState().entries;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.chatId).toBeNull();
    expect(recentSearchKey(stored[0]!)).toBe('user:alice');
  });

  it('повторная запись того же человека с новым chatId не плодит дубль', () => {
    useRecentSearchStore.getState().remember(personEntry({ chatId: null }));
    useRecentSearchStore.getState().remember(personEntry({ chatId: 'chat-2', title: 'Алиса (обновлено)' }));

    const stored = useRecentSearchStore.getState().entries;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.title).toBe('Алиса (обновлено)');
  });

  it('человек и чат с одним и тем же chatId не считаются одной записью', () => {
    useRecentSearchStore.getState().remember(chatEntry({ chatId: 'same-id' }));
    useRecentSearchStore.getState().remember(personEntry({ chatId: 'same-id', username: 'bob' }));

    expect(useRecentSearchStore.getState().entries).toHaveLength(2);
  });

  it('forget по ключу человека убирает только его', () => {
    useRecentSearchStore.getState().remember(personEntry());
    useRecentSearchStore.getState().remember(chatEntry());

    useRecentSearchStore.getState().forget(recentSearchKey(personEntry()));

    const stored = useRecentSearchStore.getState().entries;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe('chat');
  });

  it('запись с chatId: null переживает чтение из localStorage', () => {
    useRecentSearchStore.getState().remember(personEntry());

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as RecentSearchEntry[];
    expect(parsed[0]?.chatId).toBeNull();
  });
});
