import { z } from 'zod';

import {
  MESSAGE_MAX_LENGTH,
  MESSAGES_PAGE_SIZE,
} from './constants.js';
import { messageAttachmentInputSchema, type AttachmentDto } from './files.js';

export const createPrivateChatSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Укажите имя пользователя'),
});
export type CreatePrivateChatInput = z.infer<typeof createPrivateChatSchema>;

export const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(MESSAGES_PAGE_SIZE),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

/** Отправка сообщения — только через сокет, единственный способ создать сообщение (секция 3).
 *  content — подпись; обязателен, только если вложения нет. */
export const messageSendSchema = z
  .object({
    chatId: z.string().min(1),
    /** Генерируется клиентом; повтор после обрыва не создаёт дубль (секция 3). */
    clientId: z.string().min(1),
    content: z.string().trim().max(MESSAGE_MAX_LENGTH).optional(),
    replyToId: z.number().int().positive().optional(),
    attachment: messageAttachmentInputSchema.optional(),
  })
  .refine((data) => (data.content && data.content.length > 0) || data.attachment, {
    message: 'Пустое сообщение',
    path: ['content'],
  });
export type MessageSendInput = z.infer<typeof messageSendSchema>;

export type ChatType = 'PRIVATE' | 'GROUP';
export type MessageType = 'TEXT' | 'MEDIA' | 'SYSTEM';

/** Участник чата — облегчённая проекция User, без приватных полей. */
export interface ChatMemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Онлайн-статус — не хранится здесь, вычисляется клиентом из user:presence поверх этого значения. */
  lastSeenAt: string;
}

export interface MessageDto {
  id: number;
  chatId: string;
  clientId: string | null;
  sender: ChatMemberSummary | null;
  type: MessageType;
  content: string | null;
  attachment: AttachmentDto | null;
  replyToId: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface ChatListItemDto {
  id: string;
  type: ChatType;
  /** Название группы либо displayName собеседника для приватного чата. */
  title: string;
  avatarUrl: string | null;
  /** Заполнено только для PRIVATE. */
  otherMember: ChatMemberSummary | null;
  lastMessage: MessageDto | null;
  updatedAt: string;
  /** Сообщения чужих авторов с id больше собственного lastReadMessageId (секция 2). */
  unreadCount: number;
}

export interface ChatDto extends ChatListItemDto {
  members: ChatMemberSummary[];
  /** lastReadMessageId каждого участника — по нему клиент красит галочки прочтения на своих сообщениях. */
  readCursors: Record<string, number | null>;
}

export interface ChatListResponse {
  chats: ChatListItemDto[];
}

export interface MessagesPage {
  messages: MessageDto[];
  hasMore: boolean;
}

export interface MessageSendAck {
  ok: boolean;
  message?: MessageDto;
  error?: { code: string; message: string };
}
