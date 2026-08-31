import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function mockEnv(overrides: Partial<{
  TELEGRAM_BOT_TOKEN: string | undefined;
  TELEGRAM_ADMIN_CHAT_ID: string | undefined;
  TELEGRAM_NOTIFY_ENABLED: boolean;
}>) {
  vi.doMock('../src/config/env.js', () => ({
    env: {
      LOG_LEVEL: 'fatal',
      isDev: false,
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_ADMIN_CHAT_ID: undefined,
      TELEGRAM_NOTIFY_ENABLED: false,
      ...overrides,
    },
  }));
}

async function loadTelegram() {
  return import('../src/lib/telegram.js');
}

async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('lib/telegram (R-32F)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock('../src/config/env.js');
  });

  it('без токена ничего не шлёт', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_ADMIN_CHAT_ID: '123' });
    const { notifyAdmin } = await loadTelegram();

    notifyAdmin('test', () => 'событие');
    await flushMicrotasks();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('рубильник TELEGRAM_NOTIFY_ENABLED=false тоже глушит отправку', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: false, TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_ADMIN_CHAT_ID: '123' });
    const { notifyAdmin } = await loadTelegram();

    notifyAdmin('test', () => 'событие');
    await flushMicrotasks();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('отправка уходит сразу, без задержки', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_ADMIN_CHAT_ID: '123' });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const { notifyAdmin } = await loadTelegram();

    notifyAdmin('admin_login_success', () => 'Вход в админский аккаунт.');
    await flushMicrotasks();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('неверный токен: Telegram отвечает 401, отправка не бросает исключение', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: '123:invalid', TELEGRAM_ADMIN_CHAT_ID: '123' });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));
    const { notifyAdmin } = await loadTelegram();

    expect(() => notifyAdmin('test', () => 'событие')).not.toThrow();
    await expect(flushMicrotasks()).resolves.not.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).not.toContain('token');
  });

  it('таймаут/обрыв сети не бросает исключение', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_ADMIN_CHAT_ID: '123' });
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    const { notifyAdmin } = await loadTelegram();

    notifyAdmin('test', () => 'событие');
    await expect(flushMicrotasks()).resolves.not.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('склейка: повторные события одного типа в течение 10 минут не шлют новых сообщений', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_ADMIN_CHAT_ID: '123' });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const { notifyAdmin } = await loadTelegram();

    for (let i = 0; i < 7; i += 1) {
      notifyAdmin('new_report', () => 'Новая жалоба.');
      await flushMicrotasks();
    }

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('после истечения окна склейки новое событие того же типа снова отправляется', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_ADMIN_CHAT_ID: '123' });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const { notifyAdmin } = await loadTelegram();

    notifyAdmin('new_report', () => 'Новая жалоба.');
    await flushMicrotasks();
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(THROTTLE_WINDOW_MS);
    notifyAdmin('new_report', () => 'Новая жалоба.');
    await flushMicrotasks();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('часовой потолок: 21-е сообщение в час не уходит, вместо него — одно предупреждение о потолке', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_ADMIN_CHAT_ID: '123' });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const { notifyAdmin } = await loadTelegram();

    for (let i = 0; i < 22; i += 1) {
      notifyAdmin(`type_${i}`, () => `событие ${i}`);
      await flushMicrotasks();
    }

    expect(fetch).toHaveBeenCalledTimes(21);
    const texts = vi.mocked(fetch).mock.calls.map((call) => (JSON.parse(call[1]!.body as string) as { text: string }).text);
    expect(texts.filter((text) => text.includes('зачастили'))).toHaveLength(1);
  });

  it('после часового окна отправка снова разрешена', async () => {
    mockEnv({ TELEGRAM_NOTIFY_ENABLED: true, TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_ADMIN_CHAT_ID: '123' });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    const { notifyAdmin } = await loadTelegram();

    for (let i = 0; i < 21; i += 1) {
      notifyAdmin(`type_${i}`, () => `событие ${i}`);
      await flushMicrotasks();
    }
    expect(fetch).toHaveBeenCalledTimes(21);

    vi.mocked(fetch).mockClear();
    await vi.advanceTimersByTimeAsync(HOUR_MS);
    notifyAdmin('type_after_reset', () => 'снова работает');
    await flushMicrotasks();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
