import { randomUUID } from 'node:crypto';

import { ErrorCode, type ApiErrorBody } from '@messenger/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';

import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/** Ставится последним — всё, что не совпало с роутом. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = {
    error: { code: ErrorCode.NOT_FOUND, message: 'Ресурс не найден' },
  };
  res.status(404).json(body);
};

function isPayloadTooLarge(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: unknown }).type === 'entity.too.large'
  );
}

/**
 * Единый обработчик: наружу — код и текст, в лог — стек с requestId.
 * Детали Postgres клиенту не уходят (в старом сервере уходили).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    logger.warn(
      { code: err.code, status: err.httpStatus, path: req.originalUrl },
      err.message,
    );
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  // body-parser отклоняет слишком большое тело своей ошибкой, а не AppError: без этой ветки
  // превышение лимита выглядело бы как поломка сервера (R-30, PUT /users/me/card).
  if (isPayloadTooLarge(err)) {
    logger.warn({ path: req.originalUrl }, 'Тело запроса больше разрешённого');
    const body: ApiErrorBody = {
      error: { code: ErrorCode.FILE_TOO_LARGE, message: 'Слишком большой запрос' },
    };
    res.status(413).json(body);
    return;
  }

  const requestId = randomUUID();
  logger.error({ err, requestId, path: req.originalUrl, method: req.method }, 'Непредвиденная ошибка');

  const body: ApiErrorBody = {
    error: {
      code: ErrorCode.INTERNAL,
      message: 'Что-то пошло не так',
      requestId,
    },
  };
  res.status(500).json(body);
};
