import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env, isAllowedClientOrigin } from './config/env.js';
import { cardHostMiddleware } from './http/cardHost.js';
import { errorHandler, notFoundHandler } from './http/middleware/errorHandler.js';
import { generalLimiter } from './http/middleware/rateLimit.js';
import { sameOriginGuard } from './http/middleware/sameOrigin.js';
import { adminRouter } from './http/routes/admin.js';
import { appVersionRouter } from './http/routes/appVersion.js';
import { authRouter } from './http/routes/auth.js';
import { cardFontsRouter } from './http/routes/cardFonts.js';
import { callsRouter } from './http/routes/calls.js';
import { chatsRouter } from './http/routes/chats.js';
import { filesRouter } from './http/routes/files.js';
import { healthRouter } from './http/routes/health.js';
import { linksRouter } from './http/routes/links.js';
import { pushRouter } from './http/routes/push.js';
import { reportsRouter } from './http/routes/reports.js';
import { searchRouter } from './http/routes/search.js';
import { supportRouter } from './http/routes/support.js';
import { usersRouter } from './http/routes/users.js';
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

  // Домен песочницы визиток — до cookie-parser, CORS и всей аутентификации: его маршруты
  // не должны иметь доступа к сессии вообще (R-30, server/src/http/cardHost.ts).
  app.use(cardHostMiddleware);

  app.use(
    helmet({
      // Клиент и API — разные origin по дизайну (секция 6); дефолтный same-origin CORP
      // молча блокирует <img>/<video> с /api/files несмотря на успешный fetch() (CORS его не покрывает).
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Ужесточение, а не послабление: до неё встроить в приложение можно было что угодно,
          // после — только домен песочницы. Проверяется и при первой загрузке кадра, и при
          // каждой навигации внутри него, то есть кадр не уведёт сам себя на чужой адрес.
          'frame-src': [env.CARD_ORIGIN],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isAllowedClientOrigin(origin)),
      credentials: true,
      exposedHeaders: ['Content-Range', 'Accept-Ranges'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sameOriginGuard);

  // Роуты объявляются здесь и только здесь — не после server.listen(), как раньше.
  // healthRouter — до общего лимитера, чтобы мониторинг не упирался в 200/мин (секция 8).
  app.use('/api', healthRouter);
  app.use('/api', generalLimiter);
  app.use('/api/app', appVersionRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/card-fonts', cardFontsRouter);
  app.use('/api/chats', chatsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/links', linksRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
