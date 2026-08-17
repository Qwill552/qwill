import { beforeEach, describe, expect, it, vi } from 'vitest';

import { restoreAccessToken, setAccessToken } from './client';

const STORAGE_KEY = 'messenger.accessToken';

describe('хранение accessToken между запусками', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('сохранённый токен переживает перезапуск', () => {
    setAccessToken('token-1');

    expect(restoreAccessToken()).toBe('token-1');
  });

  it('протухший токен стирается и не возвращается', () => {
    vi.useFakeTimers();
    setAccessToken('token-1');

    vi.advanceTimersByTime(16 * 60 * 1000);

    expect(restoreAccessToken()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('выход стирает токен из хранилища', () => {
    setAccessToken('token-1');

    setAccessToken(null);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(restoreAccessToken()).toBeNull();
  });

  it('испорченная запись не роняет восстановление', () => {
    localStorage.setItem(STORAGE_KEY, '{');

    expect(restoreAccessToken()).toBeNull();
  });
});
