import type { ChatListItemDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UsersApi from '../api/users';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

vi.mock('../realtime/socket', () => ({ getSocket: vi.fn(() => null), connectSocket: vi.fn(), disconnectSocket: vi.fn() }));

vi.mock('../api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof UsersApi>();
  return {
    ...actual,
    blockUserRequest: vi.fn(),
    unblockUserRequest: vi.fn(),
  };
});

const { blockUserRequest, unblockUserRequest } = await import('../api/users');
const { useChatStore } = await import('./chatStore');

const CHAT_ID = 'chat-block-1';
const OTHER_ID = 'user-other';

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
    iBlocked: false,
    blockedMe: false,
    ...overrides,
  };
}

describe('chatStore: блокировка собеседника (R-32)', () => {
  beforeEach(() => {
    vi.mocked(blockUserRequest).mockReset().mockResolvedValue({ iBlocked: true, blockedMe: false });
    vi.mocked(unblockUserRequest).mockReset().mockResolvedValue({ iBlocked: false, blockedMe: false });
    useChatStore.setState({ chats: [listItem()] });
  });

  it('setUserBlocked ставит iBlocked по ответу сервера и снимает его при разблокировке', async () => {
    await useChatStore.getState().setUserBlocked(CHAT_ID, OTHER_ID, true);
    expect(blockUserRequest).toHaveBeenCalledWith(OTHER_ID);
    expect(useChatStore.getState().chats[0]?.iBlocked).toBe(true);

    await useChatStore.getState().setUserBlocked(CHAT_ID, OTHER_ID, false);
    expect(unblockUserRequest).toHaveBeenCalledWith(OTHER_ID);
    expect(useChatStore.getState().chats[0]?.iBlocked).toBe(false);
  });

  it('chat:block от собеседника поднимает blockedMe, не трогая чужие чаты', () => {
    useChatStore.setState({ chats: [listItem(), listItem({ id: 'chat-other' })] });

    useChatStore.getState().applyChatBlock({ chatId: CHAT_ID, userId: OTHER_ID, iBlocked: false, blockedMe: true });

    const chats = useChatStore.getState().chats;
    expect(chats.find((c) => c.id === CHAT_ID)?.blockedMe).toBe(true);
    expect(chats.find((c) => c.id === 'chat-other')?.blockedMe).toBe(false);
  });

  it('отказ сервера не переводит чат в заблокированное состояние', async () => {
    vi.mocked(blockUserRequest).mockRejectedValue(new Error('нет сети'));

    await expect(useChatStore.getState().setUserBlocked(CHAT_ID, OTHER_ID, true)).rejects.toThrow();
    expect(useChatStore.getState().chats[0]?.iBlocked).toBe(false);
  });
});
