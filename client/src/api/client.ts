import type { ApiErrorBody, ErrorCode } from '@messenger/shared';

const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;
export { API_URL };

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(error: ApiErrorBody['error'], status: number) {
    super(error.message);
    this.name = 'ApiError';
    this.code = error.code;
    this.status = status;
    this.fields = error.fields;
    this.requestId = error.requestId;
  }
}

/** Токен живёт только в памяти вкладки — не в localStorage (секция 4). */
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** authStore подставляет сюда вызов /auth/refresh, чтобы client.ts не знал о сторах (секция 8). */
let refreshHandler: (() => Promise<boolean>) | null = null;
export function setRefreshHandler(handler: (() => Promise<boolean>) | null): void {
  refreshHandler = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Не повторять запрос после обновления токена — используется самими auth-эндпоинтами. */
  skipAuthRetry?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const body = (data as ApiErrorBody | null)?.error ?? {
      code: 'INTERNAL' as ErrorCode,
      message: 'Не удалось выполнить запрос',
    };
    throw new ApiError(body, res.status);
  }

  return data as T;
}

/**
 * Сырой fetch с тем же Bearer/401-retry, что и apiRequest, но без JSON-обёртки — для чанков
 * загрузки файлов (секция 7), где тело бинарное и ответ разбирается вызывающим кодом самостоятельно.
 */
export async function apiFetch(
  path: string,
  init: RequestInit & { skipAuthRetry?: boolean } = {},
): Promise<Response> {
  const { skipAuthRetry, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${API_URL}${path}`, { ...rest, credentials: 'include', headers });

  if (res.status === 401 && !skipAuthRetry && refreshHandler) {
    const refreshed = await refreshHandler();
    if (refreshed) return apiFetch(path, { ...init, skipAuthRetry: true });
  }
  return res;
}

/**
 * При 401 один раз молча обновляет токен и повторяет запрос;
 * если обновить не удалось — ошибка уходит вызывающему (секция 8).
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !options.skipAuthRetry && refreshHandler) {
      const refreshed = await refreshHandler();
      if (refreshed) {
        return rawRequest<T>(path, { ...options, skipAuthRetry: true });
      }
    }
    throw error;
  }
}
