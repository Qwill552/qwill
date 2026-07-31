import { SocketEvent, type ChatUpdatedEvent, type MemberChangedEvent } from '@messenger/shared';

import { getIo } from './index.js';

/**
 * Групповые действия (добавление/удаление участника, смена роли, обновление чата) идут через
 * HTTP-роуты, а не через socket-события клиента — здесь только broadcast результата в комнату
 * чата, вызывается из server/http/routes/chats.ts после успешного вызова сервиса (этап 7).
 */
export function emitMemberChanged(chatId: string, event: MemberChangedEvent): void {
  getIo()?.to(chatId).emit(SocketEvent.MemberChanged, event);
}

export function emitChatUpdated(chatId: string, event: ChatUpdatedEvent): void {
  getIo()?.to(chatId).emit(SocketEvent.ChatUpdated, event);
}
