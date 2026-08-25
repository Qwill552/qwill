import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { isEmptyPrivateChat, selectVisibleChats } from './visibleChats';

function chat(overrides: Partial<ChatListItemDto> = {}): ChatListItemDto {
  return {
    id: 'chat-1',
    type: 'PRIVATE',
    title: 'Борис',
    avatarUrl: null,
    otherMember: null,
    lastMessage: null,
    updatedAt: '2026-08-25T10:00:00.000Z',
    unreadCount: 0,
    muted: false,
    ...overrides,
  };
}

const someMessage = { id: 7 } as MessageDto;

describe('видимость пустого приватного чата (R-12)', () => {
  it('пустой приватный чат не показывается в списке', () => {
    const chats = [chat({ id: 'empty' }), chat({ id: 'started', lastMessage: someMessage })];

    const visible = selectVisibleChats(chats, 'all');

    expect(visible.map((c) => c.id)).toEqual(['started']);
  });

  it('пустая группа показывается', () => {
    const chats = [chat({ id: 'group', type: 'GROUP', title: 'Группа' })];

    expect(selectVisibleChats(chats, 'all').map((c) => c.id)).toEqual(['group']);
  });

  it('пустой приватный чат не проходит и через фильтр «Личные»', () => {
    const chats = [chat({ id: 'empty' }), chat({ id: 'started', lastMessage: someMessage })];

    expect(selectVisibleChats(chats, 'private').map((c) => c.id)).toEqual(['started']);
  });

  it('isEmptyPrivateChat различает приватный без сообщений, с сообщением и группу', () => {
    expect(isEmptyPrivateChat(chat())).toBe(true);
    expect(isEmptyPrivateChat(chat({ lastMessage: someMessage }))).toBe(false);
    expect(isEmptyPrivateChat(chat({ type: 'GROUP' }))).toBe(false);
  });
});
