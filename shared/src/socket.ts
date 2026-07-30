/** Имена socket-событий — общий словарь для сервера и клиента (секция 3). */
export const SocketEvent = {
  MessageSend: 'message:send',
  MessageNew: 'message:new',
  ChatCreated: 'chat:created',
} as const;

export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];
