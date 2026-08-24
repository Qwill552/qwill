import type { ChatListItemDto } from '@messenger/shared';

import type { ChatFilter } from './ChatFilters';

export function selectVisibleChats(chats: ChatListItemDto[], filter: ChatFilter): ChatListItemDto[] {
  const filtered =
    filter === 'unread'
      ? chats.filter((c) => c.unreadCount > 0)
      : filter === 'private'
        ? chats.filter((c) => c.type === 'PRIVATE')
        : filter === 'groups'
          ? chats.filter((c) => c.type === 'GROUP')
          : chats;
  return [...filtered].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
