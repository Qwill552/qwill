import { SocketEvent } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitMock = vi.fn<(event: string, payload: unknown) => void>();
const connectMock = vi.fn();

const handlers = new Map<string, (arg?: unknown) => void>();

const fakeSocket = {
  emit: emitMock,
  connect: connectMock,
  disconnect: vi.fn(),
  on: vi.fn((event: string, handler: (arg?: unknown) => void) => {
    handlers.set(event, handler);
    return fakeSocket;
  }),
  connected: false,
  active: false,
  auth: {} as unknown,
};

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket) }));

const refreshSessionMock = vi.fn<() => Promise<boolean>>();
vi.mock('../api/client', () => ({ refreshSession: () => refreshSessionMock() }));

const { connectSocket, disconnectSocket, emitWhenReady } = await import('./socket');

describe('сокет: отправка не теряется до появления соединения', () => {
  beforeEach(() => {
    disconnectSocket();
    emitMock.mockReset();
    connectMock.mockReset();
  });

  it('отправка до connectSocket уходит в сокет сразу после его создания', () => {
    emitWhenReady(SocketEvent.MessageReact, { chatId: 'c1', messageId: 7, emoji: '👍' });
    expect(emitMock).not.toHaveBeenCalled();

    connectSocket('token');

    expect(emitMock).toHaveBeenCalledWith(SocketEvent.MessageReact, { chatId: 'c1', messageId: 7, emoji: '👍' });
  });

  it('порядок отложенных отправок сохраняется', () => {
    emitWhenReady(SocketEvent.MessageReact, { n: 1 });
    emitWhenReady(SocketEvent.ChatPin, { n: 2 });

    connectSocket('token');

    expect(emitMock.mock.calls.map(([event]) => event)).toEqual([SocketEvent.MessageReact, SocketEvent.ChatPin]);
  });

  it('при живом сокете отправка уходит сразу', () => {
    connectSocket('token');
    emitMock.mockReset();

    emitWhenReady(SocketEvent.MessageReact, { n: 3 });

    expect(emitMock).toHaveBeenCalledWith(SocketEvent.MessageReact, { n: 3 });
  });

  it('выход из аккаунта выбрасывает накопленное — чужие действия не уезжают следующему', () => {
    emitWhenReady(SocketEvent.MessageReact, { n: 4 });
    disconnectSocket();

    connectSocket('token');

    expect(emitMock).not.toHaveBeenCalled();
  });
});

describe('сокет: вход, отвергнутый за протухший токен', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    disconnectSocket();
    handlers.clear();
    connectMock.mockReset();
    fakeSocket.active = false;
    refreshSessionMock.mockReset();
  });

  function rejectLogin(message: string): void {
    handlers.get('connect_error')?.(new Error(message));
  }

  it('unauthorized продлевает токен один раз и входит с новым', async () => {
    const refresher = refreshSessionMock.mockImplementation(() => {
      connectSocket('fresh');
      return Promise.resolve(true);
    });
    connectSocket('stale');

    rejectLogin('unauthorized');
    await vi.runAllTimersAsync();

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fakeSocket.auth).toEqual({ token: 'fresh' });
    expect(connectMock).toHaveBeenCalled();
  });

  it('тот же токен повторно не продлевается', async () => {
    const refresher = refreshSessionMock.mockImplementation(() => Promise.resolve(true));
    connectSocket('stale');

    rejectLogin('unauthorized');
    await Promise.resolve();
    rejectLogin('unauthorized');
    await Promise.resolve();

    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('если токен не сменился, через 10 с новая попытка', async () => {
    const refresher = refreshSessionMock.mockImplementation(() => Promise.resolve(false));
    connectSocket('stale');

    rejectLogin('unauthorized');
    await vi.advanceTimersByTimeAsync(9_000);
    expect(connectMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(connectMock).toHaveBeenCalledTimes(1);

    rejectLogin('unauthorized');
    await Promise.resolve();
    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it('обрыв сети и ip_banned не продлевают токен', async () => {
    const refresher = refreshSessionMock.mockImplementation(() => Promise.resolve(true));
    connectSocket('token');

    rejectLogin('ip_banned');
    fakeSocket.active = true;
    rejectLogin('xhr poll error');
    await vi.runAllTimersAsync();

    expect(refresher).not.toHaveBeenCalled();
  });
});
