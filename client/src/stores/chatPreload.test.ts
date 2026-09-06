import type { ChatListItemDto } from '@messenger/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as chatsApi from '../api/chats';
import { getMessagesAroundRequest, getMessagesRequest } from '../api/chats';
import { NetworkError } from '../api/client';
import type * as messageCacheApi from '../cache/messageCache';
import { useChatStore } from './chatStore';

vi.mock('../api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof chatsApi>();
  return { ...actual, getMessagesRequest: vi.fn(), getMessagesAroundRequest: vi.fn() };
});

vi.mock('../cache/messageCache', async (importOriginal) => {
  const actual = await importOriginal<typeof messageCacheApi>();
  return { ...actual, readCachedPosition: vi.fn().mockResolvedValue(null), writeCachedMessages: vi.fn() };
});

function chat(id: string): ChatListItemDto {
  return {
    id,
    type: 'PRIVATE',
    title: `Чат ${id}`,
    avatarUrl: null,
    otherMember: null,
    lastMessage: null,
    updatedAt: new Date().toISOString(),
    unreadCount: 0,
    muted: false,
    isSupportRequest: false,
  } as ChatListItemDto;
}

async function runPreload(): Promise<void> {
  const promise = useChatStore.getState().preloadTopChats();
  for (let i = 0; i < 20; i += 1) {
    await vi.advanceTimersByTimeAsync(500);
  }
  await promise;
}

describe('предзагрузка верхних чатов списка (КЭШ-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.getState().reset();
    vi.mocked(getMessagesRequest).mockReset().mockResolvedValue({ messages: [], hasMore: false });
    vi.mocked(getMessagesAroundRequest).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('пишет полученные сообщения в кэш и не трогает ленту чатов', async () => {
    const { writeCachedMessages } = await import('../cache/messageCache');
    const page = { messages: [{ id: 1 } as never], hasMore: false };
    vi.mocked(getMessagesRequest).mockResolvedValue(page);
    useChatStore.setState({ chats: [chat('c1'), chat('c2')] });

    await runPreload();

    expect(useChatStore.getState().messagesByChat).toEqual({});
    expect(getMessagesRequest).toHaveBeenCalledWith('c1');
    expect(getMessagesRequest).toHaveBeenCalledWith('c2');
    expect(writeCachedMessages).toHaveBeenCalledWith(page.messages);
  });

  it('пропускает активный чат', async () => {
    useChatStore.setState({
      chats: [chat('c1'), chat('c2')],
      activeChatId: 'c1',
      historyByChat: { c1: 'ready' },
    });

    await runPreload();

    expect(getMessagesRequest).not.toHaveBeenCalledWith('c1');
    expect(getMessagesRequest).toHaveBeenCalledWith('c2');
  });

  it('останавливается при смене активного чата', async () => {
    useChatStore.setState({ chats: [chat('c1'), chat('c2'), chat('c3')] });
    vi.mocked(getMessagesRequest).mockImplementation(async (chatId: string) => {
      if (chatId === 'c1') useChatStore.setState({ activeChatId: 'c2' });
      return { messages: [], hasMore: false };
    });

    await runPreload();

    expect(getMessagesRequest).toHaveBeenCalledTimes(1);
    expect(getMessagesRequest).toHaveBeenCalledWith('c1');
  });

  it('не падает на NetworkError и продолжает после восстановления сети', async () => {
    useChatStore.setState({ chats: [chat('c1'), chat('c2')] });
    vi.mocked(getMessagesRequest).mockImplementation(async (chatId: string) => {
      if (chatId === 'c1') throw new NetworkError();
      return { messages: [], hasMore: false };
    });

    const promise = useChatStore.getState().preloadTopChats();
    await vi.advanceTimersByTimeAsync(500);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(getMessagesRequest).toHaveBeenCalledWith('c1');
    expect(getMessagesRequest).toHaveBeenCalledWith('c2');
    expect(getMessagesRequest).toHaveBeenCalledTimes(2);
  });

  it('окно вокруг сохранённого места, если позиция не у хвоста ленты', async () => {
    const { readCachedPosition } = await import('../cache/messageCache');
    vi.mocked(readCachedPosition).mockResolvedValue({
      fromId: 1,
      toId: 2,
      anchorId: 42,
      anchorOffset: 0,
      atTail: false,
    });
    vi.mocked(getMessagesAroundRequest).mockResolvedValue({ messages: [], hasMoreBefore: true, hasMoreAfter: true });
    useChatStore.setState({ chats: [chat('c1')] });

    await runPreload();

    expect(getMessagesAroundRequest).toHaveBeenCalledWith('c1', 42);
    expect(getMessagesRequest).not.toHaveBeenCalled();
  });
});
