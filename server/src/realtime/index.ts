import type { Server as HttpServer } from 'node:http';

import { messageSendSchema, SocketEvent, type MessageSendAck } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';
import { Server as SocketServer, type Socket } from 'socket.io';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { sendMessage } from '../services/message.js';

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

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Подписка на комнаты при подключении, а не при открытии чата (секция 3). */
async function bootstrapSocket(socket: Socket, userId: string): Promise<void> {
  await socket.join(userRoom(userId));
  const memberships = await prisma.chatMember.findMany({ where: { userId }, select: { chatId: true } });
  for (const membership of memberships) await socket.join(membership.chatId);
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

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Сокет отключён');
    });
  });

  return io;
}
