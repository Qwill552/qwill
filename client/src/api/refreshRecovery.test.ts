import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshRequest } from './auth';
import { ApiError, setCsrfToken } from './client';

const CSRF_KEY = 'messenger.csrfToken';

interface Call {
  csrf: string | null;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status < 400,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function authBody(csrfToken: string) {
  return { accessToken: 'access', csrfToken, user: { id: 'u1' } };
}

function recordingFetch(statuses: number[]): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  const queue = [...statuses];

  const impl = (_input: unknown, init?: RequestInit): Promise<Response> => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ csrf: headers['X-CSRF-Token'] ?? null });
    const status = queue.length > 1 ? (queue.shift() as number) : (queue[0] as number);
    if (status === 200) return Promise.resolve(jsonResponse(200, authBody('csrf-new')));
    return Promise.resolve(
      jsonResponse(status, { error: { code: 'FORBIDDEN', message: 'Проверка запроса не пройдена' } }),
    );
  };

  return { calls, fetch: impl as unknown as typeof fetch };
}

function csrfOf(calls: Call[], index: number): string | null {
  const call = calls[index];
  if (!call) throw new Error(`нет запроса №${index}`);
  return call.csrf;
}

describe('восстановление после расхождения CSRF', () => {
  beforeEach(() => {
    localStorage.clear();
    setCsrfToken('csrf-stale');
  });

  it('403 на обновлении сессии лечится повтором без устаревшего заголовка', async () => {
    const { calls, fetch } = recordingFetch([403, 200]);
    vi.stubGlobal('fetch', fetch);

    const response = await refreshRequest();

    expect(calls).toHaveLength(2);
    expect(csrfOf(calls, 0)).toBe('csrf-stale');
    expect(csrfOf(calls, 1)).toBeNull();
    expect(response.csrfToken).toBe('csrf-new');
    expect(localStorage.getItem(CSRF_KEY)).toBeNull();
  });

  it('повтор делается ровно один раз — второй 403 уходит наружу', async () => {
    const { calls, fetch } = recordingFetch([403, 403]);
    vi.stubGlobal('fetch', fetch);

    await expect(refreshRequest()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(2);
  });

  it('успешное обновление заголовок не трогает', async () => {
    const { calls, fetch } = recordingFetch([200]);
    vi.stubGlobal('fetch', fetch);

    await refreshRequest();

    expect(calls).toHaveLength(1);
    expect(csrfOf(calls, 0)).toBe('csrf-stale');
  });
});
