import type { MessageReactionDto } from '@messenger/shared';

import type { LocalMessage } from '../../stores/chatStore';
import { isGifAttachment, isViewableMedia } from './mediaKind';
import { MOSAIC_MAX_ITEMS } from './mosaicLayout';

function isAlbumMedia(message: LocalMessage): boolean {
  if (message.deletedAt || message.announcement || message.type === 'CALL') return false;
  if (message.attachment) return isViewableMedia(message.attachment) && !isGifAttachment(message.attachment);
  return message.localAttachment?.kind === 'image' || message.localAttachment?.kind === 'video';
}

function joinsAlbum(previous: LocalMessage, message: LocalMessage): boolean {
  return (
    message.albumId !== null &&
    previous.albumId === message.albumId &&
    previous.sender?.id === message.sender?.id &&
    isAlbumMedia(previous) &&
    isAlbumMedia(message) &&
    !message.content &&
    !message.replyTo &&
    !message.forwardedFrom
  );
}

export function groupAlbums(messages: LocalMessage[]): LocalMessage[][] {
  const groups: LocalMessage[][] = [];

  for (const message of messages) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    if (last && previous && last.length < MOSAIC_MAX_ITEMS && joinsAlbum(previous, message)) {
      last.push(message);
      continue;
    }
    groups.push([message]);
  }

  return groups;
}

export function mergeReactions(album: LocalMessage[]): MessageReactionDto[] {
  if (album.length === 1) return album[0]?.reactions ?? [];

  const byEmoji = new Map<string, Set<string>>();
  for (const message of album) {
    for (const reaction of message.reactions) {
      const users = byEmoji.get(reaction.emoji) ?? new Set<string>();
      reaction.userIds.forEach((userId) => users.add(userId));
      byEmoji.set(reaction.emoji, users);
    }
  }

  return [...byEmoji].map(([emoji, users]) => ({ emoji, userIds: [...users] }));
}
