import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './http/middleware/errorHandler.js';
import { healthRouter } from './http/routes/health.js';
import { logger } from './lib/logger.js';

/**
 * Сборка приложения отделена от старта сервера: интеграционные тесты
 * поднимают Express через supertest, не занимая порт (секция 3).
 */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(helmet());
  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Роуты объявляются здесь и только здесь — не после server.listen(), как раньше.
  app.use('/api', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
