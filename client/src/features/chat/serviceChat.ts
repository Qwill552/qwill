import type { ChatListItemDto } from '@messenger/shared';

/** Логотип сервисного аккаунта — тот же значок, что у установленного приложения. Он статика,
 *  а не File в хранилище: заводить для него загрузку и sha256 не за чем, а из прекэша
 *  service worker он доступен и без сети. */
export const SERVICE_AVATAR_SRC = '/icon-192.png';

/** Чат с объявлениями об обновлениях — обычный приватный чат, у которого собеседник помечен
 *  сервисным. Писать в него нельзя, звонить некому (updates/03-announcements-chat.md). */
export function isServiceChat(chat: Pick<ChatListItemDto, 'otherMember'> | null | undefined): boolean {
  return chat?.otherMember?.isService === true;
}
