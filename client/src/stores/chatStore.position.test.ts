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
  writeCachedMessages: vi.fn(async () => undefined),
  removeCachedMessages: vi.fn(async () => undefined),
  removeCachedChat: vi.fn(async () => undefined),
  pruneCachedHistory: vi.fn(async () => undefined),
  readCachedPosition: vi.fn(async () => null),
  writeCachedPosition: vi.fn(async () => undefined),
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
const { readCachedMessages, readCachedPosition, writeCachedPosition } = await import('../cache/messageCache');
const { useChatStore } = await import('./chatStore');

const CHAT_ID = 'chat-position-1';
const CHAT_B_ID = 'chat-position-2';
const HISTORY_SIZE = 300;

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

const history = Array.from({ length: HISTORY_SIZE }, (_, index) => message(index + 1));

function listItem(id: string = CHAT_ID): ChatListItemDto {
  return {
    id,
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

function detail(id: string = CHAT_ID): ChatDto {
  return { ...listItem(id), members: [], readCursors: {}, pinnedMessage: null };
}

function cachedWindow(around?: number): MessageDto[] {
  if (around === undefined) return history.slice(-100);
  const index = history.findIndex((m) => m.id === around);
  if (index === -1) return history.slice(-100);
  return history.slice(Math.max(0, index - 50), index + 50);
}

describe('chatStore: позиция в чате переживает выход (КЭШ-17)', () => {
  beforeEach(() => {
    vi.mocked(getChatRequest).mockReset().mockImplementation(async (id: string) => detail(id));
    vi.mocked(getMessagesRequest)
      .mockReset()
      .mockResolvedValue({ messages: history.slice(-50), hasMore: true });
    vi.mocked(readCachedMessages).mockReset().mockImplementation(async (_chatId, around) => cachedWindow(around));
    vi.mocked(readCachedPosition).mockReset().mockResolvedValue(null);
    vi.mocked(writeCachedPosition).mockReset();
    useChatStore.setState({
      chats: [listItem(), listItem(CHAT_B_ID)],
      activeChatId: null,
      messagesByChat: {},
      hasMoreByChat: {},
      hasMoreAfterByChat: {},
      focusByChat: {},
      positionByChat: {},
      historyByChat: {},
      chatError: null,
    });
  });

  it('записанная позиция поднимает окно вокруг неё, а не хвост', async () => {
    vi.mocked(readCachedPosition).mockResolvedValue({ fromId: 100, toId: 180, anchorId: 140, anchorOffset: -24, atTail: false });

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    const list = state.messagesByChat[CHAT_ID]!;
    expect(list.some((m) => m.id === 140)).toBe(true);
    expect(list.at(-1)!.id).toBeLessThan(HISTORY_SIZE);
    expect(state.hasMoreAfterByChat[CHAT_ID]).toBe(true);
    expect(state.focusByChat[CHAT_ID]).toMatchObject({ messageId: 140, quiet: true });
    expect(getMessagesRequest).not.toHaveBeenCalled();
  });

  it('позиция без якоря не двигает ленту — открывается хвост', async () => {
    vi.mocked(readCachedPosition).mockResolvedValue({ fromId: 100, toId: 180, anchorId: null, anchorOffset: -24, atTail: false });

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(state.focusByChat[CHAT_ID]).toBeUndefined();
    expect(state.messagesByChat[CHAT_ID]!.at(-1)!.id).toBe(HISTORY_SIZE);
  });

  it('atTail открывает хвост, как раньше', async () => {
    vi.mocked(readCachedPosition).mockResolvedValue({ fromId: 100, toId: null, anchorId: 140, anchorOffset: -24, atTail: true });

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(state.messagesByChat[CHAT_ID]!.at(-1)!.id).toBe(HISTORY_SIZE);
    expect(state.hasMoreAfterByChat[CHAT_ID]).not.toBe(true);
    expect(state.focusByChat[CHAT_ID]).toBeUndefined();
    expect(getMessagesRequest).toHaveBeenCalled();
  });

  it('позиции нет — открывается хвост', async () => {
    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(state.messagesByChat[CHAT_ID]!.at(-1)!.id).toBe(HISTORY_SIZE);
    expect(state.focusByChat[CHAT_ID]).toBeUndefined();
  });

  it('сообщений вокруг позиции в кэше нет — открывается хвост и ничего не падает', async () => {
    vi.mocked(readCachedPosition).mockResolvedValue({ fromId: 100, toId: 180, anchorId: 140, anchorOffset: -24, atTail: false });
    vi.mocked(readCachedMessages).mockResolvedValue([]);

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(state.messagesByChat[CHAT_ID]!.at(-1)!.id).toBe(HISTORY_SIZE);
    expect(state.hasMoreAfterByChat[CHAT_ID]).not.toBe(true);
    expect(state.focusByChat[CHAT_ID]).toBeUndefined();
  });

  it('лента уже в памяти — открытие чата не трогает базу и не сбивает место', async () => {
    useChatStore.setState({
      messagesByChat: { [CHAT_ID]: history.slice() },
      focusByChat: { [CHAT_ID]: { messageId: 140, seq: 1, quiet: true, offset: -24 } },
    });

    await useChatStore.getState().openChat(CHAT_ID);

    const state = useChatStore.getState();
    expect(state.messagesByChat[CHAT_ID]).toHaveLength(HISTORY_SIZE);
    expect(state.focusByChat[CHAT_ID]).toMatchObject({ messageId: 140, quiet: true, seq: 1 });
    expect(readCachedPosition).not.toHaveBeenCalled();
  });

  it('уход из чата записывает запомненную позицию', async () => {
    const position = { fromId: 100, toId: 180, anchorId: 140, anchorOffset: -24, atTail: false };
    await useChatStore.getState().openChat(CHAT_ID);
    useChatStore.getState().rememberPosition(CHAT_ID, position);

    useChatStore.getState().closeChat();

    expect(writeCachedPosition).toHaveBeenCalledWith(CHAT_ID, position);
  });

  it('уход из чата оставляет наводку на место — следующий вход не ждёт базу', async () => {
    await useChatStore.getState().openChat(CHAT_ID);
    useChatStore.getState().rememberPosition(CHAT_ID, {
      fromId: 100,
      toId: 180,
      anchorId: 140,
      anchorOffset: -24,
      atTail: false,
    });

    useChatStore.getState().closeChat();
    useChatStore.getState().handOffPosition(CHAT_ID);

    expect(useChatStore.getState().focusByChat[CHAT_ID]).toMatchObject({ messageId: 140, quiet: true, offset: -24 });
  });

  it('ушли из хвоста — наводки нет, чат откроется внизу', async () => {
    await useChatStore.getState().openChat(CHAT_ID);
    useChatStore.getState().rememberPosition(CHAT_ID, {
      fromId: null,
      toId: null,
      anchorId: 290,
      anchorOffset: -8,
      atTail: true,
    });

    useChatStore.getState().closeChat();
    useChatStore.getState().handOffPosition(CHAT_ID);

    expect(useChatStore.getState().focusByChat[CHAT_ID]).toBeUndefined();
  });

  it('без запомненной позиции уход из чата ничего не пишет', async () => {
    await useChatStore.getState().openChat(CHAT_ID);

    useChatStore.getState().closeChat();

    expect(writeCachedPosition).not.toHaveBeenCalled();
  });

  it('десктопный порядок: место снимается до выхода из чата и всё равно доживает до входа (КЭШ-17a)', async () => {
    await useChatStore.getState().openChat(CHAT_ID);
    useChatStore.getState().rememberPosition(CHAT_ID, {
      fromId: 100,
      toId: 180,
      anchorId: 140,
      anchorOffset: -24,
      atTail: false,
    });

    useChatStore.getState().handOffPosition(CHAT_ID);
    useChatStore.getState().closeChat();

    expect(useChatStore.getState().focusByChat[CHAT_ID]).toMatchObject({ messageId: 140, quiet: true, offset: -24 });
  });

  it('десктопный порядок: ушли из хвоста — наводки нет (КЭШ-17a)', async () => {
    await useChatStore.getState().openChat(CHAT_ID);
    useChatStore.getState().rememberPosition(CHAT_ID, {
      fromId: null,
      toId: null,
      anchorId: 290,
      anchorOffset: -8,
      atTail: true,
    });

    useChatStore.getState().handOffPosition(CHAT_ID);
    useChatStore.getState().closeChat();

    expect(useChatStore.getState().focusByChat[CHAT_ID]).toBeUndefined();
  });

  it('переход A → B → A оставляет каждому чату своё место (КЭШ-17a)', async () => {
    const store = () => useChatStore.getState();

    await store().openChat(CHAT_ID);
    store().rememberPosition(CHAT_ID, { fromId: 100, toId: 180, anchorId: 140, anchorOffset: -24, atTail: false });
    store().handOffPosition(CHAT_ID);
    store().closeChat();

    await store().openChat(CHAT_B_ID);
    store().rememberPosition(CHAT_B_ID, { fromId: 180, toId: 260, anchorId: 210, anchorOffset: -12, atTail: false });
    store().handOffPosition(CHAT_B_ID);
    store().closeChat();

    await store().openChat(CHAT_ID);

    expect(store().focusByChat[CHAT_ID]).toMatchObject({ messageId: 140, quiet: true, offset: -24 });
    expect(store().focusByChat[CHAT_B_ID]).toMatchObject({ messageId: 210, quiet: true, offset: -12 });
  });

  it('сворачивание приложения в открытом чате пишет позицию, но ленту не двигает (КЭШ-17a)', async () => {
    const position = { fromId: 100, toId: 180, anchorId: 140, anchorOffset: -24, atTail: false };
    await useChatStore.getState().openChat(CHAT_ID);
    useChatStore.getState().rememberPosition(CHAT_ID, position);

    useChatStore.getState().savePosition(CHAT_ID);

    expect(writeCachedPosition).toHaveBeenCalledWith(CHAT_ID, position);
    expect(useChatStore.getState().focusByChat[CHAT_ID]).toBeUndefined();
  });

  it('смена аккаунта не оставляет чужой позиции в памяти', () => {
    useChatStore.getState().rememberPosition(CHAT_ID, { fromId: 1, toId: 80, anchorId: 40, anchorOffset: 0, atTail: false });

    useChatStore.getState().reset();

    expect(useChatStore.getState().positionByChat).toEqual({});
  });
});
