import {
  ADMIN_TICKET_HEADER,
  ADMIN_TICKET_INVALID_MESSAGE,
  ADMIN_TICKET_REQUIRED_MESSAGE,
  ErrorCode,
} from '@messenger/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { forbidden } from '../../lib/errors.js';
import { verifyAdminTicket } from '../../lib/tokens.js';
import { assertAdmin } from '../../services/admin.js';
import { requireUserFromAccessToken } from '../../services/auth.js';
import type { AdminActor } from '../../services/adminLog.js';

declare global {
  // Расширение типов Express требует именно namespace — так объявлены типы в @types/express.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Заполняется requireAuth из access-токена. */
      userId?: string;
    }
  }
}

/** Проверяет access-токен из `Authorization: Bearer` и кладёт userId в req (секция 3). */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  requireUserFromAccessToken(req.headers.authorization)
    .then((userId) => {
      req.userId = userId;
      next();
    })
    .catch(next);
};

/** Второй middleware после requireAuth: роль читается из базы, а не из токена (R-32A). */
export const requireAdmin: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  assertAdmin(req.userId!)
    .then(() => next())
    .catch(next);
};

export const requireAdminTicket: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers[ADMIN_TICKET_HEADER];
  const ticket = Array.isArray(header) ? header[0] : header;
  if (!ticket) {
    next(forbidden(ADMIN_TICKET_REQUIRED_MESSAGE, ErrorCode.ADMIN_TICKET_REQUIRED));
    return;
  }

  try {
    if (verifyAdminTicket(ticket).sub !== req.userId) throw new Error('Чужой билет');
  } catch {
    next(forbidden(ADMIN_TICKET_INVALID_MESSAGE, ErrorCode.ADMIN_TICKET_REQUIRED));
    return;
  }
  next();
};

export function adminActor(req: Request): AdminActor {
  const userAgent = req.headers['user-agent'];
  return {
    adminId: req.userId!,
    ip: req.ip ?? 'unknown',
    ...(userAgent ? { userAgent } : {}),
  };
}
