/**
 * Коды ошибок — единственный контракт, который сервер отдаёт наружу.
 * Клиент маппит код в текст; сообщение из ответа используется только как запасной вариант.
 * Секция 3 дизайна: `{ error: { code, message } }`.
 */
export const ErrorCode = {
  // Общие
  INTERNAL: 'INTERNAL',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',

  // Авторизация
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USERNAME_TAKEN: 'USERNAME_TAKEN',

  // Чаты
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  FORBIDDEN: 'FORBIDDEN',

  // Сообщения
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',

  // Файлы
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  STORAGE_FULL: 'STORAGE_FULL',
  UPLOAD_SESSION_NOT_FOUND: 'UPLOAD_SESSION_NOT_FOUND',
  UPLOAD_OFFSET_MISMATCH: 'UPLOAD_OFFSET_MISMATCH',
  UPLOAD_HASH_MISMATCH: 'UPLOAD_HASH_MISMATCH',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Форма тела ответа при любой ошибке API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Присутствует только для непредвиденных ошибок — по нему ищут стек в логе. */
    requestId?: string;
    /** Присутствует при VALIDATION_FAILED: путь поля → текст ошибки. */
    fields?: Record<string, string>;
  };
}
