import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as chatsApi from '../api/chats';
import { getMessagesRequest } from '../api/chats';
import { useChatStore } from './chatStore';

vi.mock('../api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof chatsApi>();
  return { ...actual, getMessagesRequest: vi.fn() };
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

describe('окно вокруг сообщения в chatStore (PM-10)', () => {
  beforeEach(() => {
    useChatStore.setState({
      chats: [chat(0)],
      messagesByChat: { [CHAT_ID]: [message(10, 'other'), message(11, 'me')] },
      hasMoreByChat: { [CHAT_ID]: true },
      hasMoreAfterByChat: { [CHAT_ID]: true },
      anchorByChat: { [CHAT_ID]: 10 },
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

  it('возврат в конец ленты снимает якорь и снова принимает живые сообщения', async () => {
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(20, 'other')], hasMore: true });

    await useChatStore.getState().jumpToLatest(CHAT_ID);

    expect(useChatStore.getState().anchorByChat[CHAT_ID]).toBeUndefined();
    expect(useChatStore.getState().hasMoreAfterByChat[CHAT_ID]).toBeUndefined();
    expect(ids()).toEqual([20]);

    useChatStore.getState().applyIncomingMessage(message(21, 'other'));

    expect(ids()).toEqual([20, 21]);
  });
});
