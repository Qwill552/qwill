import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

import { createApp } from './app.js';
import { devHttpsCredentials, env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/prisma.js';
import { logger } from './lib/logger.js';
import { initProfileFonts } from './lib/profileFonts.js';
import { telegramNotifyState } from './lib/telegram.js';
import { createSocketServer } from './realtime/index.js';
import { ensureStorageDirs } from './services/file.js';

/** Порядок старта: env → БД → storage → http → socket (секция 3, 7). */
async function main(): Promise<void> {
  await connectDatabase();
  await ensureStorageDirs();
  initProfileFonts();

  const app = createApp();
  const httpServer = devHttpsCredentials
    ? createHttpsServer(devHttpsCredentials, app)
    : createHttpServer(app);
  const io = createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(env.PORT, resolve);
  });
  const scheme = devHttpsCredentials ? 'https' : 'http';
  logger.info(`Сервер слушает ${scheme}://localhost:${env.PORT} (${env.NODE_ENV})`);

  const telegram = telegramNotifyState();
  logger.info(
    telegram.configured
      ? 'Telegram-уведомления администратора включены'
      : `Telegram-уведомления администратора выключены, не задано: ${telegram.missing.join(', ')}`,
  );

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
