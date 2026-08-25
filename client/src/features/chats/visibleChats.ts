import type { ChatListItemDto } from '@messenger/shared';

import type { ChatFilter } from './ChatFilters';

export function isEmptyPrivateChat(chat: ChatListItemDto): boolean {
  return chat.type === 'PRIVATE' && chat.lastMessage === null;
}

export function selectVisibleChats(chats: ChatListItemDto[], filter: ChatFilter): ChatListItemDto[] {
  const started = chats.filter((c) => !isEmptyPrivateChat(c));
  const filtered =
    filter === 'unread'
      ? started.filter((c) => c.unreadCount > 0)
      : filter === 'private'
        ? started.filter((c) => c.type === 'PRIVATE')
        : filter === 'groups'
          ? started.filter((c) => c.type === 'GROUP')
          : started;
  return [...filtered].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
