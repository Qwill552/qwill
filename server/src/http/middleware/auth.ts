import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { requireUserFromAccessToken } from '../../services/auth.js';

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
