import { z } from 'zod';

import { CHAT_TITLE_MAX_LENGTH, MESSAGE_BATCH_LIMIT, MESSAGE_MAX_LENGTH, MESSAGES_PAGE_SIZE } from './constants.js';
import { isSingleEmoji } from './emoji.js';
import { messageAttachmentInputSchema, sha256Schema, type AttachmentDto } from './files.js';
import type { LinkPreviewDto } from './links.js';
import type { AvatarColor } from './user.js';

export const createPrivateChatSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Укажите имя пользователя'),
});
export type CreatePrivateChatInput = z.infer<typeof createPrivateChatSchema>;

export const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(MESSAGES_PAGE_SIZE),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const messagesSyncQuerySchema = z.object({
  sinceId: z.coerce.number().int().min(0).default(0),
  sinceUpdatedAt: z.iso.datetime().optional(),
});
export type MessagesSyncQuery = z.infer<typeof messagesSyncQuerySchema>;

export type ChatAttachmentCategory = 'media' | 'file' | 'voice' | 'gif';

export const chatAttachmentsQuerySchema = z.object({
  category: z.enum(['media', 'file', 'voice', 'gif']),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(MESSAGES_PAGE_SIZE),
});
export type ChatAttachmentsQuery = z.infer<typeof chatAttachmentsQuerySchema>;

export interface ChatAttachmentDto {
  messageId: number;
  createdAt: string;
  senderId: string | null;
  attachment: AttachmentDto;
}

export interface ChatAttachmentsPage {
  items: ChatAttachmentDto[];
  hasMore: boolean;
}

export interface ChatAttachmentCounts {
  photos: number;
  videos: number;
  voices: number;
  gifs: number;
  audios: number;
  files: number;
  links: number;
}

export const chatLinksQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(MESSAGES_PAGE_SIZE),
});
export type ChatLinksQuery = z.infer<typeof chatLinksQuerySchema>;

export interface ChatLinkDto {
  messageId: number;
  createdAt: string;
  url: string;
  preview: LinkPreviewDto | null;
}

export interface ChatLinksPage {
  items: ChatLinkDto[];
  hasMore: boolean;
}

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
    albumId: z.string().min(1).max(64).optional(),
  })
  .refine((data) => (data.content && data.content.length > 0) || data.attachment, {
    message: 'Пустое сообщение',
    path: ['content'],
  });
export type MessageSendInput = z.infer<typeof messageSendSchema>;

/** Правка сообщения — только автор, только текст (секция 3, этап 6). */
export const messageEditSchema = z.object({
  chatId: z.string().min(1),
  messageId: z.number().int().positive(),
  content: z.string().trim().min(1, 'Пустое сообщение').max(MESSAGE_MAX_LENGTH),
});
export type MessageEditInput = z.infer<typeof messageEditSchema>;

/** Удаление — мягкое, строка остаётся ради целостности цитат в replyToId (секция 2). */
export const messageDeleteSchema = z.object({
  chatId: z.string().min(1),
  messageId: z.number().int().positive(),
});
export type MessageDeleteInput = z.infer<typeof messageDeleteSchema>;

/** Реакция — любой одиночный эмодзи из панели (этап 8), повтор того же снимает реакцию (тоггл). */
export const messageReactSchema = z.object({
  chatId: z.string().min(1),
  messageId: z.number().int().positive(),
  emoji: z.string().refine(isSingleEmoji, 'Недопустимый эмодзи'),
});
export type MessageReactInput = z.infer<typeof messageReactSchema>;

/** Групповое удаление — мультивыбор, один запрос вместо цикла (этап 6, ux-ui/06). */
export const messageDeleteBatchSchema = z.object({
  chatId: z.string().min(1),
  messageIds: z.array(z.number().int().positive()).min(1).max(MESSAGE_BATCH_LIMIT),
});
export type MessageDeleteBatchInput = z.infer<typeof messageDeleteBatchSchema>;

/** Пересылка — одним запросом в один целевой чат, из мультивыбора или контекстного меню
 *  одного сообщения (этап 6). */
export const messageForwardSchema = z.object({
  fromChatId: z.string().min(1),
  toChatId: z.string().min(1),
  messageIds: z.array(z.number().int().positive()).min(1).max(MESSAGE_BATCH_LIMIT),
});
export type MessageForwardInput = z.infer<typeof messageForwardSchema>;

/** Закрепление — messageId=null снимает закреп. Одно закреплённое сообщение на чат (этап 6). */
export const chatPinSchema = z.object({
  chatId: z.string().min(1),
  messageId: z.number().int().positive().nullable(),
});
export type ChatPinInput = z.infer<typeof chatPinSchema>;

/** Создание группы — создатель становится OWNER, остальные резолвятся по @username в MEMBER
 *  (поиска пользователей по /users/search в этапе 7 ещё нет — только точное имя, как в приватном чате). */
export const createGroupSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Название не может быть пустым')
    .max(CHAT_TITLE_MAX_LENGTH, `Название не длиннее ${CHAT_TITLE_MAX_LENGTH} символов`),
  usernames: z.array(z.string().trim().toLowerCase().min(1)).min(1, 'Добавьте хотя бы одного участника'),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/** Добавление участника (и передача владения — та же форма, один @username в теле) — только
 *  OWNER/ADMIN, целевой пользователь получает роль MEMBER (этап 7). */
export const addMemberSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Укажите имя пользователя'),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

/** Смена роли — OWNER назначается только при создании группы, сюда не передаётся. */
export const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/** avatar — тот же proof-of-possession (fileId+sha256), что и setAvatarSchema для User (секция 7):
 *  без него можно было бы объявить аватаром группы чей-то приватный файл, угадав его id. */
export const updateGroupSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Название не может быть пустым')
    .max(CHAT_TITLE_MAX_LENGTH, `Название не длиннее ${CHAT_TITLE_MAX_LENGTH} символов`)
    .optional(),
  avatar: z.object({ fileId: z.string().min(1), sha256: sha256Schema }).optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const startCallSchema = z.object({
  kind: z.enum(['AUDIO', 'VIDEO']),
});
export type StartCallInput = z.infer<typeof startCallSchema>;

export const chatMuteSchema = z.object({
  muted: z.boolean(),
});
export type ChatMuteInput = z.infer<typeof chatMuteSchema>;

export const deleteChatQuerySchema = z.object({
  forEveryone: z
    .literal(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type DeleteChatQuery = z.infer<typeof deleteChatQuerySchema>;

export type ChatType = 'PRIVATE' | 'GROUP';
export type MessageType = 'TEXT' | 'MEDIA' | 'SYSTEM' | 'CALL' | 'ANNOUNCEMENT';
export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type CallKind = 'AUDIO' | 'VIDEO';
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED';

/** Участник чата — облегчённая проекция User, без приватных полей. */
export interface ChatMemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
  /** Онлайн-статус — не хранится здесь, вычисляется клиентом из user:presence поверх этого значения. */
  lastSeenAt: string;
  /** Сервисный аккаунт Qwill: логотип вместо аватара, пометка «официальный», нельзя писать
   *  и звонить (updates/03-announcements-chat.md). У живых людей всегда false. */
  isService: boolean;
}

/** Участник группы с ролью — панель управления группой (этап 7). username — чтобы клиент мог
 *  вызвать addMemberSchema-совместимые действия (передача владения) без отдельного поиска. */
export interface GroupMemberDTO {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
  role: GroupRole;
  joinedAt: string;
}

export interface UpdateRoleDTO {
  role: 'ADMIN' | 'MEMBER';
}

export interface UpdateGroupDTO {
  title?: string;
  avatar?: { fileId: string; sha256: string };
}

/** Краткая цитата в ответе — снимок сообщения на момент отправки ответа (секция 6, этап 6). */
export interface MessageReplyPreviewDto {
  id: number;
  senderName: string;
  content: string | null;
  hasAttachment: boolean;
  deletedAt: string | null;
}

/** Реакции сгруппированы по эмодзи; userIds включает и меня, если я реагировал (этап 6). */
export interface MessageReactionDto {
  emoji: string;
  userIds: string[];
}

/** Снимок оригинала при пересылке — только имя автора, содержимое показывает само
 *  пересланное сообщение (этап 6). Тот же приём снимка, что и у MessageReplyPreviewDto:
 *  переживает удаление оригинала. */
export interface MessageForwardPreviewDto {
  id: number;
  senderName: string;
}

export interface MessageCallDto {
  id: string;
  kind: CallKind;
  status: CallStatus;
  startedAt: string | null;
  endedAt: string | null;
}

/** Объявление о выпуске приложения — структура, а не текст: пузырь рисует заголовок,
 *  список пунктов и кнопку «Обновить» сам (updates/03-announcements-chat.md). */
export interface MessageAnnouncementDto {
  id: string;
  versionCode: number;
  versionName: string;
  changelog: string[];
}

export interface MessageDto {
  id: number;
  chatId: string;
  clientId: string | null;
  albumId: string | null;
  sender: ChatMemberSummary | null;
  type: MessageType;
  content: string | null;
  attachment: AttachmentDto | null;
  replyToId: number | null;
  replyTo: MessageReplyPreviewDto | null;
  forwardedFrom: MessageForwardPreviewDto | null;
  call: MessageCallDto | null;
  announcement: MessageAnnouncementDto | null;
  reactions: MessageReactionDto[];
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
  /** Уведомления по этому чату выключены лично мной — пуши о новых сообщениях не уходят.
   *  На звонки не влияет. */
  muted: boolean;
  isSupportRequest: boolean;
}

export interface ChatDto extends ChatListItemDto {
  members: ChatMemberSummary[];
  /** lastReadMessageId каждого участника — по нему клиент красит галочки прочтения на своих сообщениях. */
  readCursors: Record<string, number | null>;
  /** Закреплённое сообщение чата, если есть (этап 6). Полный DTO, а не превью — баннер
   *  показывает содержимое так же, как лента. */
  pinnedMessage: MessageDto | null;
}

export interface ChatListResponse {
  chats: ChatListItemDto[];
}

export interface MessagesPage {
  messages: MessageDto[];
  hasMore: boolean;
}

export interface MessagesSyncResponse {
  created: MessageDto[];
  changed: MessageDto[];
  maxId: number | null;
  maxUpdatedAt: string | null;
  hasMore: boolean;
}

export interface MessageSendAck {
  ok: boolean;
  message?: MessageDto;
  error?: { code: string; message: string };
}

export interface CallParticipantDto {
  user: ChatMemberSummary;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface CallDto {
  id: string;
  chatId: string;
  initiator: ChatMemberSummary | null;
  kind: CallKind;
  status: CallStatus;
  startedAt: string | null;
  endedAt: string | null;
  participants: CallParticipantDto[];
}

export interface CallAccessDto {
  call: CallDto;
  token: string;
  url: string;
}
