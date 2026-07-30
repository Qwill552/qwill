/** Имена socket-событий — общий словарь для сервера и клиента (секция 3). */
export const SocketEvent = {
  MessageSend: 'message:send',
  MessageNew: 'message:new',
  ChatCreated: 'chat:created',
  ChatRead: 'chat:read',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  UserTyping: 'user:typing',
  UserPresence: 'user:presence',
} as const;

export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];

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
