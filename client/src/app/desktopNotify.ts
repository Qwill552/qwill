import {
  ANNOUNCEMENT_PREVIEW_TEXT,
  isPlayableVideoMimeType,
  type ChatListItemDto,
  type MessageDto,
} from '@messenger/shared';

import { acquireObjectUrl, releaseObjectUrl } from '../cache/objectUrls';
import { isDesktopShell, notifyDesktop } from '../native/desktop';
import { playNotificationSound } from '../ui/notificationSound';
import { formatHourMinute } from '../utils/dateFormats';

const FILE_ID_PATTERN = /\/api\/files\/([^/?]+)/;
const avatarCache = new Map<string, string>();

function previewOf(message: MessageDto): string {
  if (message.call) return message.call.status === 'DECLINED' ? 'Отклонённый звонок' : 'Звонок';
  if (message.announcement) return ANNOUNCEMENT_PREVIEW_TEXT;
  if (message.content) return message.content;

  if (message.attachment) {
    const mimeType = message.attachment.file.mimeType;
    if (mimeType.startsWith('audio/')) return 'Голосовое сообщение';
    if (mimeType.startsWith('image/')) return 'Фото';
    if (isPlayableVideoMimeType(mimeType)) return 'Видео';
    return message.attachment.originalName || 'Файл';
  }

  return 'Новое сообщение';
}

/** Плашка живёт в другом окне, и `blob:`-ссылка кэша там недействительна — аватар едет
 *  data-URL'ом. Разворачивается он один раз на чат: картинка маленькая (тир avatar). */
async function avatarDataUrl(chat: ChatListItemDto): Promise<string | null> {
  const fileId = chat.avatarUrl ? FILE_ID_PATTERN.exec(chat.avatarUrl)?.[1] : null;
  if (!fileId) return null;

  const cached = avatarCache.get(fileId);
  if (cached) return cached;

  const objectUrl = await acquireObjectUrl(fileId, { tier: 'avatar', chatId: null, kind: 'avatar' });
  if (!objectUrl) return null;

  try {
    const blob = await fetch(objectUrl).then((response) => response.blob());
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('avatar'));
      reader.readAsDataURL(blob);
    });
    avatarCache.set(fileId, dataUrl);
    return dataUrl;
  } catch {
    return null;
  } finally {
    releaseObjectUrl(fileId);
  }
}

export function notifyDesktopOfMessage(message: MessageDto, chat: ChatListItemDto, activeChatId: string | null): void {
  if (!isDesktopShell() || chat.muted) return;
  if (activeChatId === message.chatId && document.hasFocus()) return;

  const preview = previewOf(message);
  const body = chat.type === 'GROUP' && message.sender ? `${message.sender.displayName}: ${preview}` : preview;

  playNotificationSound();

  void avatarDataUrl(chat).then((avatarUrl) => {
    notifyDesktop({
      title: chat.title,
      body,
      chatId: message.chatId,
      time: formatHourMinute(new Date(message.createdAt)),
      avatarColor: chat.otherMember?.avatarColor ?? null,
      avatarUrl,
    });
  });
}
