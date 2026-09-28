import type { ChatDto, ChatListItemDto, MessageDto } from '@messenger/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ChatsApi from '../api/chats';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Listener[]>();

const fakeSocket = {
  on(event: string, listener: Listener) {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    return fakeSocket;
  },
  off(event?: string, listener?: Listener) {
    if (event === undefined) listeners.clear();
    else if (listener === undefined) listeners.delete(event);
    else listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== listener));
    return fakeSocket;
  },
  emit: vi.fn(),
};

vi.mock('../realtime/socket', () => ({
  getSocket: vi.fn(() => fakeSocket),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  emitWhenReady: vi.fn(),
}));

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
    getMessagesAfterRequest: vi.fn(),
    dropEmptyChatRequest: vi.fn(),
  };
});

const { getChatRequest, getMessagesRequest, getMessagesAfterRequest } = await import('../api/chats');
const { useChatStore } = await import('./chatStore');

const CHAT_ID = 'chat-unread-1';
const ME = 'me';
const PEER = 'peer';

function message(id: number, sender: string = PEER): MessageDto {
  return {
    id,
    chatId: CHAT_ID,
    clientId: null,
    albumId: null,
    sender: { id: sender, username: sender, displayName: sender, avatarUrl: null, avatarColor: 'blue', lastSeenAt: '', isService: false },
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

function listItem(unreadCount: number): ChatListItemDto {
  return {
    id: CHAT_ID,
    type: 'PRIVATE',
    title: 'Борис',
    avatarUrl: null,
    otherMember: null,
    lastMessage: null,
    updatedAt: new Date().toISOString(),
    unreadCount,
    muted: false,
    isSupportRequest: false,
    iBlocked: false,
    blockedMe: false,
  };
}

function detail(unreadCount: number, cursor: number | null): ChatDto {
  return { ...listItem(unreadCount), members: [], readCursors: { [ME]: cursor, [PEER]: null }, pinnedMessage: null, activeCall: null };
}

function emit(event: string, payload: unknown): void {
  for (const listener of listeners.get(event) ?? []) listener(payload);
}

describe('chatStore: непрочитанное как в Telegram (НАТ-11, «По пути»)', () => {
  beforeEach(() => {
    listeners.clear();
    useChatStore.getState().reset();
    useChatStore.setState({ chats: [listItem(2)], myUserId: ME });
    vi.mocked(getChatRequest).mockReset();
    vi.mocked(getMessagesRequest).mockReset();
    vi.mocked(getMessagesAfterRequest).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('чат открывается на первом непрочитанном внутри хвоста', async () => {
    vi.mocked(getChatRequest).mockResolvedValue(detail(2, 11));
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(10), message(11), message(12), message(13)], hasMore: true });

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(state.unreadAnchorByChat[CHAT_ID]).toEqual({ messageId: 12, count: 2 });
    expect(state.focusByChat[CHAT_ID]).toMatchObject({ messageId: 12, quiet: true, unread: true });
    expect(state.unreadDecidedByChat[CHAT_ID]).toBe(true);
    expect(getMessagesAfterRequest).not.toHaveBeenCalled();
  });

  it('непрочитанное глубже хвоста — лента заменяется страницей после курсора', async () => {
    useChatStore.setState({ chats: [listItem(30)] });
    vi.mocked(getChatRequest).mockResolvedValue(detail(30, 20));
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(60), message(61)], hasMore: true });
    vi.mocked(getMessagesAfterRequest).mockResolvedValue({ messages: [message(21), message(22)], hasMore: true });

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(getMessagesAfterRequest).toHaveBeenCalledWith(CHAT_ID, 20);
    expect(state.messagesByChat[CHAT_ID]?.map((m) => m.id)).toEqual([21, 22]);
    expect(state.hasMoreByChat[CHAT_ID]).toBe(true);
    expect(state.hasMoreAfterByChat[CHAT_ID]).toBe(true);
    expect(state.unreadAnchorByChat[CHAT_ID]).toEqual({ messageId: 21, count: 30 });
  });

  it('прыжок, с которым открыли чат, главнее непрочитанного', async () => {
    useChatStore.getState().focusMessage(CHAT_ID, 11);
    vi.mocked(getChatRequest).mockResolvedValue(detail(2, 11));
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(11), message(12), message(13)], hasMore: true });

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(state.unreadAnchorByChat[CHAT_ID]).toBeUndefined();
    expect(state.focusByChat[CHAT_ID]).toMatchObject({ messageId: 11 });
    expect(state.unreadDecidedByChat[CHAT_ID]).toBe(true);
  });

  it('новое чужое в открытом чате прибавляет единицу, а не обнуляет', () => {
    useChatStore.getState().subscribeToSocket(ME);
    useChatStore.setState({ activeChatId: CHAT_ID, messagesByChat: { [CHAT_ID]: [message(1)] } });

    emit('message:new', message(2));
    emit('message:new', message(3, ME));

    expect(useChatStore.getState().chats[0]?.unreadCount).toBe(3);
  });

  it('своё chat:read не обнуляет счётчик, а через секунду перезапрашивает чат пачкой', async () => {
    vi.useFakeTimers();
    useChatStore.getState().subscribeToSocket(ME);
    vi.mocked(getChatRequest).mockResolvedValue(detail(1, 12));

    emit('chat:read', { chatId: CHAT_ID, userId: ME, lastReadMessageId: 11 });
    emit('chat:read', { chatId: CHAT_ID, userId: ME, lastReadMessageId: 12 });
    expect(useChatStore.getState().chats[0]?.unreadCount).toBe(2);
    expect(useChatStore.getState().readCursorsByChat[CHAT_ID]?.[ME]).toBe(12);

    await vi.advanceTimersByTimeAsync(1000);

    expect(getChatRequest).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().chats[0]?.unreadCount).toBe(1);
  });

  it('локальный счётчик не уходит ниже нуля', () => {
    useChatStore.getState().setLocalUnread(CHAT_ID, -3);
    expect(useChatStore.getState().chats[0]?.unreadCount).toBe(0);
  });
});
