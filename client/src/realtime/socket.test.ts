import { SocketEvent } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitMock = vi.fn<(event: string, payload: unknown) => void>();
const connectMock = vi.fn();

const fakeSocket = {
  emit: emitMock,
  connect: connectMock,
  disconnect: vi.fn(),
  on: vi.fn(),
  connected: false,
  auth: {} as unknown,
};

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket) }));

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
