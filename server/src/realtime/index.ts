import type { Server as HttpServer } from 'node:http';

import { Server as SocketServer } from 'socket.io';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Каркас realtime-слоя. Аутентификация, подписка на комнаты всех чатов
 * пользователя и хендлеры событий появятся на этапах 1–2.
 */
export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Сокет подключён');
    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Сокет отключён');
    });
  });

  return io;
}
