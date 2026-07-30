import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/prisma.js';
import { logger } from './lib/logger.js';
import { createSocketServer } from './realtime/index.js';

/** Порядок старта: env → БД → http → socket (секция 3). */
async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(env.PORT, resolve);
  });
  logger.info(`Сервер слушает http://localhost:${env.PORT} (${env.NODE_ENV})`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Получен ${signal}, останавливаюсь`);
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Не удалось запустить сервер');
  process.exit(1);
});
