import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as chatsApi from '../api/chats';
import { getMessagesAfterRequest, getMessagesRequest } from '../api/chats';
import { FEED_ACCUMULATOR_LIMIT } from '../features/messages/feedWindow';
import { useChatStore } from './chatStore';

vi.mock('../api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof chatsApi>();
  return { ...actual, getMessagesRequest: vi.fn(), getMessagesAfterRequest: vi.fn() };
});

const CHAT_ID = 'window-chat';

function message(id: number, senderId: string): MessageDto {
  return {
    id,
    chatId: CHAT_ID,
    clientId: null,
    albumId: null,
    sender: { id: senderId, username: senderId, displayName: senderId, avatarUrl: null, avatarColor: 'blue' },
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
  } as unknown as MessageDto;
}

function chat(unreadCount: number): ChatListItemDto {
  return {
    id: CHAT_ID,
    type: 'PRIVATE',
    title: 'Собеседник',
    avatarUrl: null,
    otherMember: null,
    lastMessage: null,
    unreadCount,
    muted: false,
    updatedAt: new Date().toISOString(),
  } as unknown as ChatListItemDto;
}

function ids(): number[] {
  return (useChatStore.getState().messagesByChat[CHAT_ID] ?? []).map((m) => m.id);
}

describe('окно вокруг сообщения в chatStore (PM-10, PM-10a)', () => {
  beforeEach(() => {
    useChatStore.setState({
      chats: [chat(0)],
      messagesByChat: { [CHAT_ID]: [message(10, 'other'), message(11, 'me')] },
      hasMoreByChat: { [CHAT_ID]: true },
      hasMoreAfterByChat: { [CHAT_ID]: true },
      feedEpochByChat: { [CHAT_ID]: 1 },
      focusByChat: { [CHAT_ID]: { messageId: 10, seq: 1 } },
      activeChatId: CHAT_ID,
      myUserId: 'me',
    });
  });

  it('живое сообщение не дописывается в незамкнутое окно', () => {
    useChatStore.getState().applyIncomingMessage(message(99, 'other'));

    expect(ids()).toEqual([10, 11]);
  });

  it('чат с открытым окном считает пришедшее сообщение непрочитанным', () => {
    useChatStore.getState().applyIncomingMessage(message(99, 'other'));

    expect(useChatStore.getState().chats[0]!.unreadCount).toBe(1);
  });

  it('возврат в конец ленты снимает окно и снова принимает живые сообщения', async () => {
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(20, 'other')], hasMore: true });

    await useChatStore.getState().jumpToLatest(CHAT_ID);

    expect(useChatStore.getState().focusByChat[CHAT_ID]).toBeUndefined();
    expect(useChatStore.getState().hasMoreAfterByChat[CHAT_ID]).toBe(false);
    expect(ids()).toEqual([20]);

    useChatStore.getState().applyIncomingMessage(message(21, 'other'));

    expect(ids()).toEqual([20, 21]);
  });

  it('подмена ленты не пускает в неё мягко удалённые сообщения', () => {
    const removed = { ...message(30, 'other'), deletedAt: new Date().toISOString(), content: null } as MessageDto;

    useChatStore.getState().replaceFeed(CHAT_ID, [message(29, 'other'), removed, message(31, 'me')], {
      hasMoreBefore: true,
      hasMoreAfter: true,
    });

    expect(ids()).toEqual([29, 31]);
  });

  it('подмена ленты сохраняет неотправленное из очереди', () => {
    useChatStore.setState({
      messagesByChat: { [CHAT_ID]: [message(10, 'other'), { ...message(-5, 'me'), status: 'sending' } as never] },
    });

    useChatStore.getState().replaceFeed(CHAT_ID, [message(40, 'other')], {
      hasMoreBefore: false,
      hasMoreAfter: false,
    });

    expect(ids()).toEqual([40, -5]);
  });

  it('подмена поднимает эпоху ленты, а обычная догрузка — нет', async () => {
    const before = useChatStore.getState().feedEpochByChat[CHAT_ID] ?? 0;

    useChatStore.getState().replaceFeed(CHAT_ID, [message(50, 'other')], {
      hasMoreBefore: true,
      hasMoreAfter: true,
    });
    expect(useChatStore.getState().feedEpochByChat[CHAT_ID]).toBe(before + 1);

    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(49, 'other')], hasMore: false });
    await useChatStore.getState().loadMore(CHAT_ID);

    expect(useChatStore.getState().feedEpochByChat[CHAT_ID]).toBe(before + 1);
    expect(ids()).toEqual([49, 50]);
  });

  it('догрузка вниз до конца снимает признак незамкнутого окна', async () => {
    vi.mocked(getMessagesAfterRequest).mockResolvedValue({ messages: [message(12, 'other')], hasMore: false });

    await useChatStore.getState().loadMoreAfter(CHAT_ID);

    expect(ids()).toEqual([10, 11, 12]);
    expect(useChatStore.getState().hasMoreAfterByChat[CHAT_ID]).toBe(false);
  });

  it('догрузка вверх подрезает дальний низ и снова размыкает окно', async () => {
    const long = Array.from({ length: FEED_ACCUMULATOR_LIMIT }, (_, i) => message(100 + i, 'other'));
    useChatStore.setState({
      messagesByChat: { [CHAT_ID]: long as never },
      hasMoreAfterByChat: { [CHAT_ID]: false },
    });
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(99, 'other')], hasMore: true });

    await useChatStore.getState().loadMore(CHAT_ID, { keepFromId: 100, keepToId: 120 });

    const list = useChatStore.getState().messagesByChat[CHAT_ID] ?? [];
    expect(list).toHaveLength(FEED_ACCUMULATOR_LIMIT);
    expect(list[0]!.id).toBe(99);
    expect(list.at(-1)!.id).toBe(100 + FEED_ACCUMULATOR_LIMIT - 2);
    expect(useChatStore.getState().hasMoreAfterByChat[CHAT_ID]).toBe(true);
  });

  it('запас впрок растит накопитель и не двигает его дальний край', async () => {
    const base = Array.from({ length: 50 }, (_, i) => message(1000 + i, 'other'));
    useChatStore.setState({
      messagesByChat: { [CHAT_ID]: base as never },
      hasMoreByChat: { [CHAT_ID]: true },
      hasMoreAfterByChat: { [CHAT_ID]: false },
    });

    let oldest = 1000;
    vi.mocked(getMessagesRequest).mockImplementation(async () => {
      const page = Array.from({ length: 50 }, (_, i) => message(oldest - 50 + i, 'other'));
      oldest -= 50;
      return { messages: page, hasMore: true };
    });

    useChatStore.getState().prefetchFeed(CHAT_ID, 'older', 100, { keepFromId: 1000, keepToId: 1049 });

    await vi.waitFor(() => expect(ids()).toHaveLength(150));
    expect(ids()[0]).toBe(900);
    expect(ids().at(-1)).toBe(1049);
  });

  it('при полном запасе фоновая догрузка в сеть не ходит', () => {
    vi.mocked(getMessagesRequest).mockClear();

    useChatStore.getState().prefetchFeed(CHAT_ID, 'older', 0, null);

    expect(getMessagesRequest).not.toHaveBeenCalled();
  });

  it('запас впрок вниз доводит накопитель до конца истории', async () => {
    useChatStore.setState({
      messagesByChat: { [CHAT_ID]: [message(10, 'other')] as never },
      hasMoreAfterByChat: { [CHAT_ID]: true },
    });
    vi.mocked(getMessagesAfterRequest)
      .mockResolvedValueOnce({ messages: [message(11, 'other')], hasMore: true })
      .mockResolvedValueOnce({ messages: [message(12, 'other')], hasMore: false });

    useChatStore.getState().prefetchFeed(CHAT_ID, 'newer', 100, null);

    await vi.waitFor(() => expect(useChatStore.getState().hasMoreAfterByChat[CHAT_ID]).toBe(false));
    expect(ids()).toEqual([10, 11, 12]);
  });

  it('фокус на уже загруженном сообщении не трогает ленту и растит счётчик', () => {
    const epoch = useChatStore.getState().feedEpochByChat[CHAT_ID] ?? 0;

    useChatStore.getState().focusMessage(CHAT_ID, 10);
    useChatStore.getState().focusMessage(CHAT_ID, 10);

    expect(useChatStore.getState().feedEpochByChat[CHAT_ID] ?? 0).toBe(epoch);
    expect(useChatStore.getState().focusByChat[CHAT_ID]).toEqual({ messageId: 10, seq: 3 });
    expect(ids()).toEqual([10, 11]);
  });

  it('сорвавшаяся фоновая догрузка молчит и не долбит сервер', async () => {
    const failing = 'window-chat-offline';
    useChatStore.setState({
      messagesByChat: { [failing]: [message(10, 'other')] as never },
      hasMoreByChat: { [failing]: true },
    });
    vi.mocked(getMessagesRequest).mockClear();
    vi.mocked(getMessagesRequest).mockRejectedValue(new Error('нет сети'));

    useChatStore.getState().prefetchFeed(failing, 'older', 100, null);
    await vi.waitFor(() => expect(getMessagesRequest).toHaveBeenCalledTimes(1));

    useChatStore.getState().prefetchFeed(failing, 'older', 100, null);
    await Promise.resolve();

    expect(getMessagesRequest).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().messagesByChat[failing]).toHaveLength(1);
  });
});
