import type { ChatDto, ChatListItemDto } from '@messenger/shared';
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

vi.mock('../api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof ChatsApi>();
  return {
    ...actual,
    getChatRequest: vi.fn(),
    getMessagesRequest: vi.fn(),
    dropEmptyChatRequest: vi.fn(),
  };
});

const { getChatRequest, getMessagesRequest, dropEmptyChatRequest } = await import('../api/chats');
const { useChatStore } = await import('./chatStore');

const CHAT_ID = 'chat-empty-1';

function listItem(overrides: Partial<ChatListItemDto> = {}): ChatListItemDto {
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
    ...overrides,
  };
}

function detail(overrides: Partial<ChatListItemDto> = {}): ChatDto {
  return { ...listItem(overrides), members: [], readCursors: {}, pinnedMessage: null };
}

describe('chatStore: уборка пустого приватного чата (R-12)', () => {
  beforeEach(() => {
    vi.mocked(getChatRequest).mockReset().mockResolvedValue(detail());
    vi.mocked(getMessagesRequest).mockReset().mockResolvedValue({ messages: [], hasMore: false });
    vi.mocked(dropEmptyChatRequest).mockReset();
    useChatStore.setState({
      chats: [listItem()],
      activeChatId: null,
      messagesByChat: {},
      hasMoreByChat: {},
      chatError: null,
    });
  });

  it('StrictMode mount→cleanup→mount не удаляет только что открытый чат', async () => {
    const store = useChatStore.getState();

    const firstMount = store.openChat(CHAT_ID);
    store.closeChat();
    const secondMount = store.openChat(CHAT_ID);
    await Promise.all([firstMount, secondMount]);
    await vi.waitFor(() => expect(useChatStore.getState().activeChatId).toBe(CHAT_ID));

    expect(dropEmptyChatRequest).not.toHaveBeenCalled();
    expect(useChatStore.getState().chats.some((c) => c.id === CHAT_ID)).toBe(true);
  });

  it('настоящий выход из пустого чата убирает его и просит сервер прибрать', async () => {
    const store = useChatStore.getState();

    await store.openChat(CHAT_ID);
    store.closeChat();
    await vi.waitFor(() => expect(dropEmptyChatRequest).toHaveBeenCalledWith(CHAT_ID));

    expect(useChatStore.getState().chats.some((c) => c.id === CHAT_ID)).toBe(false);
  });

  it('выход из чата с сообщением ничего не удаляет', async () => {
    const withMessage = { lastMessage: { id: 5 } as never };
    vi.mocked(getChatRequest).mockResolvedValue(detail(withMessage));
    useChatStore.setState({ chats: [listItem(withMessage)] });
    const store = useChatStore.getState();

    await store.openChat(CHAT_ID);
    store.closeChat();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(dropEmptyChatRequest).not.toHaveBeenCalled();
    expect(useChatStore.getState().chats.some((c) => c.id === CHAT_ID)).toBe(true);
  });
});
