import { ErrorCode } from '@messenger/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

import { badRequest } from '../../lib/errors.js';

/** Валидирует req.body по Zod-схеме; при ошибке — VALIDATION_FAILED с полями (секция 3). */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Без тела (или без Content-Type: application/json) express.json оставляет req.body undefined.
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '(тело запроса)';
        if (!(path in fields)) fields[path] = issue.message;
      }
      next(badRequest(ErrorCode.VALIDATION_FAILED, 'Некорректные данные', fields));
      return;
    }

    req.body = result.data;
    next();
  };
}
