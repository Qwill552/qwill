import type { ChatSearchResponse, MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ChatsApi from '../api/chats';

vi.mock('../api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof ChatsApi>();
  return { ...actual, searchInChatRequest: vi.fn() };
});

vi.mock('../features/search/jumpToSearchResult', () => ({
  jumpToSearchResult: vi.fn(() => Promise.resolve('ok')),
  cancelSearchJumps: vi.fn(),
}));

const { searchInChatRequest } = await import('../api/chats');
const { jumpToSearchResult } = await import('../features/search/jumpToSearchResult');
const { useChatSearchStore } = await import('./chatSearchStore');

const search = vi.mocked(searchInChatRequest);
const jump = vi.mocked(jumpToSearchResult);

function page(ids: number[], total = ids.length): ChatSearchResponse {
  return {
    messages: ids.map((id) => ({ id, chatId: 'c1', content: `сообщение ${id}` }) as MessageDto),
    total,
    hasMore: false,
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('chatSearchStore: правила Telegram (НАТ-12Б, «По пути»)', () => {
  beforeEach(async () => {
    search.mockReset();
    jump.mockClear();
    search.mockResolvedValue(page([30, 20, 10]));
    useChatSearchStore.getState().openSearch('c1');
    await settle();
  });

  it('набор текста в «Списком» возвращает в «В чате»', () => {
    useChatSearchStore.getState().setMode('list');
    expect(useChatSearchStore.getState().mode).toBe('list');
    useChatSearchStore.getState().setDraft('п');
    expect(useChatSearchStore.getState().mode).toBe('chat');
  });

  it('«Списком» не включается при нуле результатов', async () => {
    search.mockResolvedValue(page([]));
    useChatSearchStore.getState().setDraft('нет такого');
    useChatSearchStore.getState().submit();
    await settle();
    useChatSearchStore.getState().setMode('list');
    expect(useChatSearchStore.getState().mode).toBe('chat');
  });

  it('выбор участника: подпись, поле пустое, поиск по нему с прыжком к самому новому', async () => {
    useChatSearchStore.getState().startPicking();
    expect(useChatSearchStore.getState().picking).toBe(true);
    useChatSearchStore.getState().setDraft('ан');
    useChatSearchStore.getState().submit();
    expect(search).toHaveBeenCalledTimes(1);

    search.mockResolvedValue(page([11, 4]));
    useChatSearchStore.getState().pick('u7');
    await settle();
    const state = useChatSearchStore.getState();
    expect(state.picking).toBe(false);
    expect(state.draft).toBe('');
    expect(state.fromUserId).toBe('u7');
    expect(search).toHaveBeenLastCalledWith('c1', '', expect.objectContaining({ fromUserId: 'u7' }));
    expect(jump).toHaveBeenLastCalledWith('c1', 11);
  });

  it('снятие подписи: «От: Имя» → выбор участника → обычный поиск', async () => {
    useChatSearchStore.getState().startPicking();
    useChatSearchStore.getState().pick('u7');
    await settle();
    jump.mockClear();

    useChatSearchStore.getState().clearCaption();
    await settle();
    expect(useChatSearchStore.getState().fromUserId).toBeNull();
    expect(useChatSearchStore.getState().picking).toBe(true);
    expect(search).toHaveBeenLastCalledWith('c1', '', expect.objectContaining({ fromUserId: null }));
    expect(jump).not.toHaveBeenCalled();

    useChatSearchStore.getState().clearCaption();
    expect(useChatSearchStore.getState().picking).toBe(false);
  });
});
