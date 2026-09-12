import type { CallAccessDto, CallDto, CallKind, GroupMemberDTO, GroupRole, MessageDto, MessageReactionDto } from './chat.js';

/** Имена socket-событий — общий словарь для сервера и клиента (секция 3). */
export const SocketEvent = {
  MessageSend: 'message:send',
  MessageNew: 'message:new',
  MessageEdit: 'message:edit',
  MessageUpdated: 'message:updated',
  MessageDelete: 'message:delete',
  MessageDeleted: 'message:deleted',
  MessageDeleteBatch: 'message:deleteBatch',
  MessageDeletedBatch: 'message:deletedBatch',
  MessageForward: 'message:forward',
  MessageReact: 'message:react',
  MessageReaction: 'message:reaction',
  ChatCreated: 'chat:created',
  ChatDeleted: 'chat:deleted',
  ChatRead: 'chat:read',
  ChatPin: 'chat:pin',
  ChatPinned: 'chat:pinned',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  UserTyping: 'user:typing',
  UserPresence: 'user:presence',
  ChatUpdated: 'chat:updated',
  ChatBlock: 'chat:block',
  MemberChanged: 'member:changed',
  VisibilityChange: 'visibility:change',
  CallStart: 'call:start',
  CallInvite: 'call:invite',
  CallAccept: 'call:accept',
  CallDecline: 'call:decline',
  CallLeave: 'call:leave',
  CallEnded: 'call:ended',
  CallParticipantChanged: 'call:participantChanged',
  CallLive: 'call:live',
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

/** Ack на message:deleteBatch/message:forward — групповые операции мультивыбора (этап 6). */
export interface MessageBatchAck {
  ok: boolean;
  messages?: MessageDto[];
  error?: { code: string; message: string };
}

/** Сервер → клиент: пачка сообщений удалена одним запросом мультивыбора (этап 6). */
export interface MessageDeletedBatchEvent {
  chatId: string;
  messages: MessageDto[];
}

/** Сервер → клиент: закреп чата изменился — message=null означает открепление (этап 6). */
export interface ChatPinnedEvent {
  chatId: string;
  message: MessageDto | null;
}

export interface ChatDeletedEvent {
  chatId: string;
}

export interface ChatBlockEvent {
  chatId: string;
  userId: string;
  iBlocked: boolean;
  blockedMe: boolean;
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

/** Клиент → сервер: вкладка стала видимой/скрытой (Page Visibility API) — определяет, слать ли push. */
export interface VisibilityPayload {
  visible: boolean;
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

export interface CallStartPayload {
  chatId: string;
  kind: CallKind;
}

export interface CallActionPayload {
  callId: string;
}

export interface CallStartAck {
  ok: boolean;
  access?: CallAccessDto;
  error?: { code: string; message: string };
}

export type CallAcceptAck = CallStartAck;

export interface CallInviteEvent {
  call: CallDto;
}

export interface CallEndedEvent {
  call: CallDto;
}

export interface CallParticipantChangedEvent {
  call: CallDto;
}

/** Звонки, в которых человек всё ещё числится участником, — присылаются при подключении сокета,
 *  чтобы перезапуск приложения или перезагрузка вкладки не теряли разговор. */
export interface CallLiveEvent {
  calls: CallDto[];
}
