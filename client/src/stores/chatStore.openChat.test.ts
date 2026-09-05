import type { ChatDto, ChatListItemDto, MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ChatsApi from '../api/chats';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

vi.mock('../realtime/socket', () => ({ getSocket: vi.fn(() => null), connectSocket: vi.fn(), disconnectSocket: vi.fn() }));

vi.mock('../cache/messageCache', () => ({
  CACHED_HISTORY_LIMIT: 200,
  readCachedChats: vi.fn(async () => []),
  writeCachedChats: vi.fn(async () => undefined),
  readCachedMessages: vi.fn(async () => []),
  readCachedPosition: vi.fn(async () => null),
  writeCachedPosition: vi.fn(async () => undefined),
  writeCachedMessages: vi.fn(async () => undefined),
  removeCachedMessages: vi.fn(async () => undefined),
  removeCachedChat: vi.fn(async () => undefined),
  pruneCachedHistory: vi.fn(async () => undefined),
}));

vi.mock('../api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof ChatsApi>();
  return {
    ...actual,
    getChatRequest: vi.fn(),
    getMessagesRequest: vi.fn(),
    dropEmptyChatRequest: vi.fn(),
  };
});

const { getChatRequest, getMessagesRequest } = await import('../api/chats');
const { readCachedMessages } = await import('../cache/messageCache');
const { NetworkError } = await import('../api/client');
const { useChatStore } = await import('./chatStore');

const CHAT_ID = 'chat-instant-1';

function message(id: number): MessageDto {
  return {
    id,
    chatId: CHAT_ID,
    clientId: null,
    albumId: null,
    sender: null,
    type: 'TEXT',
    content: `сообщение ${id}`,
    attachment: null,
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    announcement: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(id * 1000).toISOString(),
  } as MessageDto;
}

function listItem(): ChatListItemDto {
  return {
    id: CHAT_ID,
    type: 'PRIVATE',
    title: 'Борис',
    avatarUrl: null,
    otherMember: null,
    lastMessage: null,
    updatedAt: new Date().toISOString(),
    unreadCount: 0,
    muted: false,
    isSupportRequest: false,
  };
}

function detail(): ChatDto {
  return { ...listItem(), members: [], readCursors: {}, pinnedMessage: null };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('chatStore.openChat: мгновенное открытие и офлайн (R-16)', () => {
  beforeEach(() => {
    vi.mocked(getChatRequest).mockReset().mockResolvedValue(detail());
    vi.mocked(getMessagesRequest).mockReset().mockResolvedValue({ messages: [], hasMore: false });
    vi.mocked(readCachedMessages).mockReset().mockResolvedValue([]);
    useChatStore.setState({
      chats: [listItem()],
      activeChatId: null,
      messagesByChat: {},
      hasMoreByChat: {},
      historyByChat: {},
      chatError: null,
    });
  });

  it('кэш попадает в ленту, не дожидаясь ответа сети', async () => {
    const cached = [message(1), message(2), message(3)];
    vi.mocked(readCachedMessages).mockResolvedValue(cached);

    const detailGate = deferred<ChatDto>();
    const pageGate = deferred<{ messages: MessageDto[]; hasMore: boolean }>();
    vi.mocked(getChatRequest).mockReturnValue(detailGate.promise);
    vi.mocked(getMessagesRequest).mockReturnValue(pageGate.promise);

    const opening = useChatStore.getState().openChat(CHAT_ID);

    await vi.waitFor(() => expect(useChatStore.getState().messagesByChat[CHAT_ID]).toHaveLength(3));
    expect(useChatStore.getState().historyByChat[CHAT_ID]).toBe('ready');

    detailGate.resolve(detail());
    pageGate.resolve({ messages: [message(3)], hasMore: true });
    await opening;
  });

  it('ответ сети дополняет ленту, а не подменяет её', async () => {
    const cached = Array.from({ length: 120 }, (_, index) => message(index + 1));
    vi.mocked(readCachedMessages).mockResolvedValue(cached);
    vi.mocked(getMessagesRequest).mockResolvedValue({
      messages: cached.slice(-50).concat(message(121)),
      hasMore: true,
    });

    await useChatStore.getState().openChat(CHAT_ID);

    const list = useChatStore.getState().messagesByChat[CHAT_ID]!;
    expect(list).toHaveLength(121);
    expect(list[0]!.id).toBe(1);
    expect(list.at(-1)!.id).toBe(121);
    expect(useChatStore.getState().hasMoreByChat[CHAT_ID]).toBe(true);
  });

  it('офлайн без кэша даёт состояние offline, а не пустую ленту', async () => {
    vi.mocked(getChatRequest).mockRejectedValue(new NetworkError());
    vi.mocked(getMessagesRequest).mockRejectedValue(new NetworkError());

    await useChatStore.getState().openChat(CHAT_ID);

    expect(useChatStore.getState().historyByChat[CHAT_ID]).toBe('offline');
    expect(useChatStore.getState().chatError).toBeNull();
  });

  it('офлайн с кэшем оставляет историю читаемой', async () => {
    vi.mocked(readCachedMessages).mockResolvedValue([message(1), message(2)]);
    vi.mocked(getChatRequest).mockRejectedValue(new NetworkError());
    vi.mocked(getMessagesRequest).mockRejectedValue(new NetworkError());

    await useChatStore.getState().openChat(CHAT_ID);

    expect(useChatStore.getState().messagesByChat[CHAT_ID]).toHaveLength(2);
    expect(useChatStore.getState().historyByChat[CHAT_ID]).toBe('ready');
  });

  it('по-настоящему пустой чат отмечается как ready', async () => {
    await useChatStore.getState().openChat(CHAT_ID);

    expect(useChatStore.getState().messagesByChat[CHAT_ID]).toEqual([]);
    expect(useChatStore.getState().historyByChat[CHAT_ID]).toBe('ready');
  });

  it('недоступный чат по-прежнему показывает ошибку', async () => {
    vi.mocked(getChatRequest).mockRejectedValue(new Error('403'));
    vi.mocked(getMessagesRequest).mockRejectedValue(new Error('403'));

    await useChatStore.getState().openChat(CHAT_ID);

    expect(useChatStore.getState().chatError).toBe('Чат не найден или недоступен');
  });

  it('primeChatFromCache заполняет ленту до openChat', async () => {
    vi.mocked(readCachedMessages).mockResolvedValue([message(1), message(2)]);

    await useChatStore.getState().primeChatFromCache(CHAT_ID);

    expect(useChatStore.getState().messagesByChat[CHAT_ID]).toHaveLength(2);
    expect(useChatStore.getState().historyByChat[CHAT_ID]).toBe('ready');
  });
});
