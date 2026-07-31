import type { GroupMemberDTO, GroupRole, MessageDto, MessageReactionDto } from './chat.js';

/** Имена socket-событий — общий словарь для сервера и клиента (секция 3). */
export const SocketEvent = {
  MessageSend: 'message:send',
  MessageNew: 'message:new',
  MessageEdit: 'message:edit',
  MessageUpdated: 'message:updated',
  MessageDelete: 'message:delete',
  MessageDeleted: 'message:deleted',
  MessageReact: 'message:react',
  MessageReaction: 'message:reaction',
  ChatCreated: 'chat:created',
  ChatRead: 'chat:read',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  UserTyping: 'user:typing',
  UserPresence: 'user:presence',
  ChatUpdated: 'chat:updated',
  MemberChanged: 'member:changed',
} as const;

export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];

/** Ack на message:edit/message:delete/message:react — только ошибка важна, апдейт приходит broadcast'ом (этап 6). */
export interface MessageActionAck {
  ok: boolean;
  message?: MessageDto;
  error?: { code: string; message: string };
}

/** Сервер → клиент: сообщение отредактировано или удалено — приходит уже собранный MessageDto
 *  (при удалении content/attachment в нём уже скрыты сервером) (секция 3, этап 6). */
export interface MessageUpdatedEvent {
  message: MessageDto;
}
export type MessageDeletedEvent = MessageUpdatedEvent;

/** Сервер → клиент: изменился набор реакций конкретного сообщения (секция 3, этап 6). */
export interface MessageReactionEvent {
  chatId: string;
  messageId: number;
  reactions: MessageReactionDto[];
}

/** Клиент → сервер: «прочитано всё вплоть до этого сообщения» (секция 3). */
export interface ChatReadPayload {
  chatId: string;
  messageId: number;
}

/** Сервер → клиент: новый курсор прочтения участника — двигает бейджи и галочки везде (секция 3, 8). */
export interface ChatReadEvent {
  chatId: string;
  userId: string;
  lastReadMessageId: number;
}

/** Клиент → сервер: печатает/перестал печатать в чате. */
export interface TypingPayload {
  chatId: string;
}

/** Сервер → клиент: кто-то печатает в чате. Гаснет сам через TYPING_TIMEOUT_MS, если stop потерялся. */
export interface UserTypingEvent {
  chatId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

/** Сервер → клиент: онлайн-статус участника общего чата. */
export interface UserPresenceEvent {
  userId: string;
  online: boolean;
  lastSeenAt: string;
}

/** Сервер → клиент: изменились название/аватар группы (этап 7). */
export interface ChatUpdatedEvent {
  chatId: string;
  title: string;
  avatarUrl: string | null;
  updatedAt: string;
}

/** Сервер → клиент: изменился состав или роли участников группы (этап 7). */
export type MemberChangedEvent =
  | { type: 'added'; chatId: string; member: GroupMemberDTO }
  | { type: 'removed'; chatId: string; userId: string }
  | { type: 'role'; chatId: string; userId: string; role: GroupRole }
  | { type: 'left'; chatId: string; userId: string };
