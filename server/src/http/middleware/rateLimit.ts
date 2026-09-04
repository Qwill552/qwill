import { CARD_IMAGE_UPLOADS_PER_DAY, ErrorCode, type ApiErrorBody } from '@messenger/shared';
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

/**
 * Открытие сессии загрузки — 120/мин на пользователя; requireAuth должен идти раньше в цепочке
 * (секция 8). Одно фото это два файла (превью и оригинал), то есть два открытия: прежние 20/мин
 * означали пять фото в минуту и валили любую отправку альбома.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  // Сырой IPv6-адрес как ключ обходится сменой адреса внутри своей /64 —
  // ipKeyGenerator сводит подсеть к одному ключу (ERR_ERL_KEY_GEN_IPV6).
  keyGenerator: (req) => req.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  skip: skipInTest,
  handler: sendRateLimited,
});

/**
 * Куски уже открытой сессии — 1200/мин на пользователя. Это данные, а не операции: при куске
 * в 5 МБ потолок упирается в скорость канала задолго до лимита, а размер самого куска и права
 * на сессию проверяются отдельно.
 */
export const uploadChunkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  skip: skipInTest,
  handler: sendRateLimited,
});

/**
 * Сохранение визитки — 20 в час на пользователя (R-30). Тело до 2 МБ и разбор настоящим
 * парсером на каждое сохранение: это дороже обычного PATCH профиля, и повторять его сотнями
 * незачем даже добросовестному редактору.
 */
export const cardSaveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  skip: skipInTest,
  handler: sendRateLimited,
});

/**
 * Загрузка картинки визитки — 40 в сутки на пользователя (R-30C). Каждая проходит полное
 * перекодирование через sharp, и это ощутимо дороже сохранения самого HTML.
 */
export const cardImageUploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: CARD_IMAGE_UPLOADS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  skip: skipInTest,
  handler: sendRateLimited,
});

/**
 * Картинки и шрифты визитки — 3000 в час на IP. Отдельно от cardViewLimiter: одна визитка
 * тянет за собой десяток файлов, и лимит на документы её же и задушил бы.
 */
export const cardAssetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: sendRateLimited,
});

/**
 * Показ визитки — 300 в час на IP. Домен песочницы аутентификации не имеет вовсе, ключ
 * может быть только по адресу; общий лимитер сюда не достаёт — он живёт под /api.
 */
export const cardViewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: sendRateLimited,
});

export const linkPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
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
