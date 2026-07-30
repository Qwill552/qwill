import { ErrorCode } from '@messenger/shared';
import type { ZodType } from 'zod';

import { badRequest } from './errors.js';

/** Общий разбор Zod-схемы для body и query — при ошибке бросает VALIDATION_FAILED с полями (секция 3). */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '(запрос)';
    if (!(path in fields)) fields[path] = issue.message;
  }
  throw badRequest(ErrorCode.VALIDATION_FAILED, 'Некорректные данные', fields);
}
