import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

import { parseOrThrow } from '../../lib/validate.js';

/** Валидирует req.body по Zod-схеме; при ошибке — VALIDATION_FAILED с полями (секция 3). */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Без тела (или без Content-Type: application/json) express.json оставляет req.body undefined.
      req.body = parseOrThrow(schema, req.body ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };
}
