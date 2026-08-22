import type { LocalMessage } from '../../stores/chatStore';
import { isViewableMedia } from './mediaKind';
import { MOSAIC_MAX_ITEMS } from './mosaicLayout';

export const ALBUM_WINDOW_MS = 60 * 1000;

function isAlbumMedia(message: LocalMessage): boolean {
  return (
    message.id > 0 &&
    !message.deletedAt &&
    !message.localAttachment &&
    !message.announcement &&
    message.type !== 'CALL' &&
    message.reactions.length === 0 &&
    !!message.attachment &&
    isViewableMedia(message.attachment)
  );
}

function joinsAlbum(previous: LocalMessage, message: LocalMessage): boolean {
  return (
    isAlbumMedia(previous) &&
    isAlbumMedia(message) &&
    previous.sender?.id === message.sender?.id &&
    !message.content &&
    !message.replyTo &&
    !message.forwardedFrom &&
    !message.editedAt &&
    new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < ALBUM_WINDOW_MS
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
