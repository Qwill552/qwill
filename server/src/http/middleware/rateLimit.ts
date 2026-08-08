import { ErrorCode, type ApiErrorBody } from '@messenger/shared';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';

import { env } from '../../config/env.js';

/** Единый ответ 429 в формате ApiErrorBody — как и остальные ошибки (errorHandler.ts). */
function sendRateLimited(_req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: { code: ErrorCode.RATE_LIMITED, message: 'Слишком много запросов, попробуйте позже' },
  };
  res.status(429).json(body);
}

// Интеграционные тесты (supertest, один процесс, общий "IP") создают в сумме десятки
// пользователей за секунды — в NODE_ENV=test лимиты отключаются, иначе тесты друг друга душат.
const skipInTest = (): boolean => env.isTest;

/** Логин/регистрация — 10/мин на IP (секция 8). */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: sendRateLimited,
});

/** Загрузка файлов — 20/мин на пользователя; requireAuth должен идти раньше в цепочке (секция 8). */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Сырой IPv6-адрес как ключ обходится сменой адреса внутри своей /64 —
  // ipKeyGenerator сводит подсеть к одному ключу (ERR_ERL_KEY_GEN_IPV6).
  keyGenerator: (req) => req.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  skip: skipInTest,
  handler: sendRateLimited,
});

/** Остальные запросы — 200/мин на IP (секция 8). */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: sendRateLimited,
});
