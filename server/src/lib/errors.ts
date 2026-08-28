import { ErrorCode } from '@messenger/shared';

/**
 * Ожидаемая ошибка: наружу уходит только код и текст, в лог — полный стек.
 * Всё, что не AppError, обработчик считает непредвиденным и прячет за «Что-то пошло не так».
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly fields?: Record<string, string>;

  constructor(
    code: ErrorCode,
    httpStatus: number,
    message: string,
    options?: { fields?: Record<string, string>; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    if (options?.fields) this.fields = options.fields;
  }
}

export const badRequest = (code: ErrorCode, message: string, fields?: Record<string, string>) =>
  new AppError(code, 400, message, fields ? { fields } : undefined);

export const unauthorized = (message = 'Требуется вход', code: ErrorCode = ErrorCode.UNAUTHORIZED) =>
  new AppError(code, 401, message);

export const forbidden = (message = 'Нет доступа', code: ErrorCode = ErrorCode.FORBIDDEN) =>
  new AppError(code, 403, message);

export const banned = (reason: string | null) =>
  new AppError(
    ErrorCode.USER_BANNED,
    403,
    reason ? `Аккаунт заблокирован. Причина: ${reason}` : 'Аккаунт заблокирован',
  );

export const notFound = (code: ErrorCode, message: string) => new AppError(code, 404, message);

export const conflict = (code: ErrorCode, message: string) => new AppError(code, 409, message);

export const tooLarge = (message: string) => new AppError(ErrorCode.FILE_TOO_LARGE, 413, message);

export const rateLimited = (message = 'Слишком много запросов, попробуйте позже') =>
  new AppError(ErrorCode.RATE_LIMITED, 429, message);
