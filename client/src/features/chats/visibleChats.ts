import type { ChatListItemDto } from '@messenger/shared';

import { chatSortTime, type Drafts } from '../../stores/draftsStore';

import type { ChatFilter } from './ChatFilters';

export function isEmptyPrivateChat(chat: ChatListItemDto): boolean {
  return chat.type === 'PRIVATE' && chat.lastMessage === null;
}

export function selectVisibleChats(
  chats: ChatListItemDto[],
  filter: ChatFilter,
  isAdmin = false,
  drafts: Drafts = {},
): ChatListItemDto[] {
  const started = chats.filter((c) => !isEmptyPrivateChat(c));
  const filtered =
    filter === 'unread'
      ? started.filter((c) => c.unreadCount > 0)
      : filter === 'private'
        ? started.filter((c) => c.type === 'PRIVATE')
        : filter === 'groups'
          ? started.filter((c) => c.type === 'GROUP')
          : filter === 'support'
            ? started.filter((c) => c.isSupportRequest)
            : isAdmin
              ? started.filter((c) => !c.isSupportRequest)
              : started;
  return [...filtered].sort((a, b) => chatSortTime(b, drafts[b.id]) - chatSortTime(a, drafts[a.id]));
}
