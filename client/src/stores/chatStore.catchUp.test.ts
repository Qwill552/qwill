import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ChatsApi from '../api/chats';
import type * as SyncEngine from '../cache/syncEngine';

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
  return { ...actual, listChatsRequest: vi.fn(), getMessagesRequest: vi.fn(async () => ({ messages: [], hasMore: false })) };
});

vi.mock('../cache/syncEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof SyncEngine>();
  return { ...actual, readSyncCursors: vi.fn(), syncChat: vi.fn(async () => null) };
});

const { listChatsRequest } = await import('../api/chats');
const { readSyncCursors, syncChat } = await import('../cache/syncEngine');
const { NetworkError } = await import('../api/client');
const { useChatStore } = await import('./chatStore');

function lastMessage(chatId: string, id: number): MessageDto {
  return {
    id,
    chatId,
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

function chat(id: string, lastId: number): ChatListItemDto {
  return {
    id,
    type: 'PRIVATE',
    title: id,
    avatarUrl: null,
    otherMember: null,
    lastMessage: lastMessage(id, lastId),
    updatedAt: new Date(lastId * 1000).toISOString(),
    unreadCount: 0,
    muted: false,
    isSupportRequest: false,
    iBlocked: false,
    blockedMe: false,
  };
}

describe('догон после подключения', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    vi.mocked(listChatsRequest).mockReset();
    vi.mocked(syncChat).mockClear();
    vi.mocked(readSyncCursors).mockReset().mockResolvedValue(
      new Map([
        ['quiet', { maxId: 7, maxUpdatedAt: null }],
        ['busy', { maxId: 3, maxUpdatedAt: null }],
        ['open', { maxId: 2, maxUpdatedAt: null }],
      ]),
    );
  });

  it('перезапрашивает список чатов и догоняет открытый первым, остальные — только с новым', async () => {
    useChatStore.setState({ chats: [chat('quiet', 1)], chatsLoaded: true, activeChatId: 'open' });
    vi.mocked(listChatsRequest).mockResolvedValue({ chats: [chat('quiet', 7), chat('busy', 9), chat('open', 2)] });

    await useChatStore.getState().catchUpAfterConnect();

    expect(listChatsRequest).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().chats.map((c) => c.lastMessage?.id)).toEqual([7, 9, 2]);
    expect(vi.mocked(syncChat).mock.calls.map(([chatId]) => chatId)).toEqual(['open', 'busy']);
  });

  it('без сети список не трогает и не догоняет', async () => {
    useChatStore.setState({ chats: [chat('quiet', 1)], chatsLoaded: true });
    vi.mocked(listChatsRequest).mockRejectedValue(new NetworkError());

    await useChatStore.getState().catchUpAfterConnect();

    expect(useChatStore.getState().chats.map((c) => c.id)).toEqual(['quiet']);
    expect(syncChat).not.toHaveBeenCalled();
  });

  it('одновременные загрузки списка делят один запрос', async () => {
    vi.mocked(listChatsRequest).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ chats: [chat('busy', 9)] }), 50)),
    );

    await Promise.all([useChatStore.getState().loadChats(), useChatStore.getState().loadChats()]);

    expect(listChatsRequest).toHaveBeenCalledTimes(1);
  });
});
