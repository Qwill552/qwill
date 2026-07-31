import type { Server as HttpServer } from 'node:http';

import {
  messageDeleteSchema,
  messageEditSchema,
  messageReactSchema,
  messageSendSchema,
  SocketEvent,
  type ChatReadEvent,
  type ChatReadPayload,
  type MessageActionAck,
  type MessageReactionEvent,
  type MessageSendAck,
  type TypingPayload,
  type UserPresenceEvent,
  type UserTypingEvent,
} from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';
import { Server as SocketServer, type Socket } from 'socket.io';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { assertMember, getCoMemberIds, markChatRead } from '../services/chat.js';
import { deleteMessage, editMessage, reactToMessage, sendMessage } from '../services/message.js';
import { getUserById } from '../services/user.js';
import { presenceStore } from './presence.js';

let io: SocketServer | null = null;

/** Личная комната сокетов пользователя — на неё держатся уведомления о новых чатах и т.п. (секция 3). */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function getIo(): SocketServer | null {
  return io;
}

/** Подключает все сокеты пользователя к комнате чата — вызывается сразу после создания чата (секция 3). */
export async function subscribeUserToChat(userId: string, chatId: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  for (const socket of sockets) socket.join(chatId);
}

/**
 * Отключает все сокеты пользователя от комнаты чата — вызывается после исключения/выхода из
 * группы (секция 8: «доступ к истории теряется с момента выхода»). Без этого сокет остаётся в
 * комнате и продолжает получать message:new и другие события чата, к которому уже нет доступа.
 * Вызывать после broadcast member:changed — иначе сам исключённый не увидит событие о себе.
 */
export async function unsubscribeUserFromChat(userId: string, chatId: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  for (const socket of sockets) socket.leave(chatId);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/**
 * Разово синхронизирует онлайн-статус между двумя пользователями сразу после создания чата —
 * без этого собеседник узнаёт о статусе друг друга только после переподключения сокета,
 * так как getCoMemberIds на момент их последнего connect ещё не видел этот чат (секция 3).
 */
export async function syncPresenceBetween(userIdA: string, userIdB: string): Promise<void> {
  const [userA, userB] = await Promise.all([
    prisma.user.findUnique({ where: { id: userIdA } }),
    prisma.user.findUnique({ where: { id: userIdB } }),
  ]);

  if (userA) {
    const event: UserPresenceEvent = {
      userId: userIdA,
      online: presenceStore.isOnline(userIdA),
      lastSeenAt: userA.lastSeenAt.toISOString(),
    };
    emitToUser(userIdB, SocketEvent.UserPresence, event);
  }
  if (userB) {
    const event: UserPresenceEvent = {
      userId: userIdB,
      online: presenceStore.isOnline(userIdB),
      lastSeenAt: userB.lastSeenAt.toISOString(),
    };
    emitToUser(userIdA, SocketEvent.UserPresence, event);
  }
}

/** Подписка на комнаты при подключении, а не при открытии чата (секция 3). */
async function bootstrapSocket(socket: Socket, userId: string): Promise<void> {
  await socket.join(userRoom(userId));
  const memberships = await prisma.chatMember.findMany({ where: { userId }, select: { chatId: true } });
  for (const membership of memberships) await socket.join(membership.chatId);

  const user = await getUserById(userId);
  socket.data.displayName = user.displayName;

  // Первый сокет пользователя — он был оффлайн, и нужно и разослать его "онлайн", и прислать снапшот чужих статусов.
  const wasOffline = presenceStore.addSocket(userId) === 1;
  const coMemberIds = await getCoMemberIds(userId);

  for (const coMemberId of coMemberIds) {
    if (presenceStore.isOnline(coMemberId)) {
      socket.emit(SocketEvent.UserPresence, {
        userId: coMemberId,
        online: true,
        lastSeenAt: new Date().toISOString(),
      } satisfies UserPresenceEvent);
    }
  }

  if (wasOffline) {
    const event: UserPresenceEvent = { userId, online: true, lastSeenAt: new Date().toISOString() };
    for (const coMemberId of coMemberIds) emitToUser(coMemberId, SocketEvent.UserPresence, event);
  }
}

/** Последний сокет пользователя отключился — пишем lastSeenAt и оповещаем совместные чаты (секция 3). */
async function teardownSocket(userId: string): Promise<void> {
  const stillOnline = presenceStore.removeSocket(userId) > 0;
  if (stillOnline) return;

  const lastSeenAt = new Date();
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } });

  const coMemberIds = await getCoMemberIds(userId);
  const event: UserPresenceEvent = { userId, online: false, lastSeenAt: lastSeenAt.toISOString() };
  for (const coMemberId of coMemberIds) emitToUser(coMemberId, SocketEvent.UserPresence, event);
}

async function handleChatRead(userId: string, payload: ChatReadPayload): Promise<void> {
  if (!payload?.chatId || !Number.isInteger(payload.messageId)) return;

  // Членство проверяется в БД (markChatRead → assertMember), а не через socket.rooms —
  // join комнаты в bootstrapSocket асинхронный и может ещё не завершиться к этому моменту.
  const lastReadMessageId = await markChatRead(payload.chatId, userId, payload.messageId);
  const event: ChatReadEvent = { chatId: payload.chatId, userId, lastReadMessageId };
  io?.to(payload.chatId).emit(SocketEvent.ChatRead, event);
}

async function handleTyping(socket: Socket, userId: string, payload: TypingPayload, isTyping: boolean): Promise<void> {
  if (!payload?.chatId) return;
  await assertMember(payload.chatId, userId);

  const event: UserTypingEvent = {
    chatId: payload.chatId,
    userId,
    displayName: (socket.data.displayName as string | undefined) ?? '',
    isTyping,
  };
  socket.to(payload.chatId).emit(SocketEvent.UserTyping, event);
}

async function handleMessageSend(
  userId: string,
  payload: unknown,
  ack?: (response: MessageSendAck) => void,
): Promise<void> {
  const parsed = messageSendSchema.safeParse(payload);
  if (!parsed.success) {
    ack?.({ ok: false, error: { code: ErrorCode.VALIDATION_FAILED, message: 'Некорректное сообщение' } });
    return;
  }

  try {
    const message = await sendMessage({ ...parsed.data, senderId: userId });
    io?.to(parsed.data.chatId).emit(SocketEvent.MessageNew, message);
    ack?.({ ok: true, message });
  } catch (error) {
    if (error instanceof AppError) {
      ack?.({ ok: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}

async function handleMessageEdit(
  userId: string,
  payload: unknown,
  ack?: (response: MessageActionAck) => void,
): Promise<void> {
  const parsed = messageEditSchema.safeParse(payload);
  if (!parsed.success) {
    ack?.({ ok: false, error: { code: ErrorCode.VALIDATION_FAILED, message: 'Некорректная правка' } });
    return;
  }

  try {
    const message = await editMessage({ ...parsed.data, userId });
    io?.to(parsed.data.chatId).emit(SocketEvent.MessageUpdated, { message });
    ack?.({ ok: true, message });
  } catch (error) {
    if (error instanceof AppError) {
      ack?.({ ok: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}

async function handleMessageDelete(
  userId: string,
  payload: unknown,
  ack?: (response: MessageActionAck) => void,
): Promise<void> {
  const parsed = messageDeleteSchema.safeParse(payload);
  if (!parsed.success) {
    ack?.({ ok: false, error: { code: ErrorCode.VALIDATION_FAILED, message: 'Некорректный запрос' } });
    return;
  }

  try {
    const message = await deleteMessage({ ...parsed.data, userId });
    io?.to(parsed.data.chatId).emit(SocketEvent.MessageDeleted, { message });
    ack?.({ ok: true, message });
  } catch (error) {
    if (error instanceof AppError) {
      ack?.({ ok: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}

async function handleMessageReact(
  userId: string,
  payload: unknown,
  ack?: (response: MessageActionAck) => void,
): Promise<void> {
  const parsed = messageReactSchema.safeParse(payload);
  if (!parsed.success) {
    ack?.({ ok: false, error: { code: ErrorCode.VALIDATION_FAILED, message: 'Некорректная реакция' } });
    return;
  }

  try {
    const reactions = await reactToMessage({ ...parsed.data, userId });
    const event: MessageReactionEvent = { chatId: parsed.data.chatId, messageId: parsed.data.messageId, reactions };
    io?.to(parsed.data.chatId).emit(SocketEvent.MessageReaction, event);
    ack?.({ ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      ack?.({ ok: false, error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }
}

export function createSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  // Access-токен передаётся в handshake.auth — та же проверка, что и на HTTP (секция 3).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    logger.debug({ socketId: socket.id, userId }, 'Сокет подключён');

    bootstrapSocket(socket, userId).catch((error: unknown) => {
      logger.error({ err: error, userId }, 'Не удалось подписать сокет на чаты');
    });

    socket.on(SocketEvent.MessageSend, (payload, ack?: (response: MessageSendAck) => void) => {
      handleMessageSend(userId, payload, ack).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Ошибка обработки message:send');
      });
    });

    socket.on(SocketEvent.MessageEdit, (payload, ack?: (response: MessageActionAck) => void) => {
      handleMessageEdit(userId, payload, ack).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Ошибка обработки message:edit');
      });
    });

    socket.on(SocketEvent.MessageDelete, (payload, ack?: (response: MessageActionAck) => void) => {
      handleMessageDelete(userId, payload, ack).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Ошибка обработки message:delete');
      });
    });

    socket.on(SocketEvent.MessageReact, (payload, ack?: (response: MessageActionAck) => void) => {
      handleMessageReact(userId, payload, ack).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Ошибка обработки message:react');
      });
    });

    socket.on(SocketEvent.ChatRead, (payload: ChatReadPayload) => {
      handleChatRead(userId, payload).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Ошибка обработки chat:read');
      });
    });

    socket.on(SocketEvent.TypingStart, (payload: TypingPayload) => {
      handleTyping(socket, userId, payload, true).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Ошибка обработки typing:start');
      });
    });

    socket.on(SocketEvent.TypingStop, (payload: TypingPayload) => {
      handleTyping(socket, userId, payload, false).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Ошибка обработки typing:stop');
      });
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Сокет отключён');
      teardownSocket(userId).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Не удалось обработать отключение сокета');
      });
    });
  });

  return io;
}
