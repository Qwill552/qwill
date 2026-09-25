import { beforeEach, describe, expect, it, vi } from 'vitest';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

type Listener = (...args: unknown[]) => void;

const listeners = new Map<string, Listener[]>();

const fakeSocket = {
  on(event: string, listener: Listener) {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    return fakeSocket;
  },
  off(event?: string, listener?: Listener) {
    if (event === undefined) listeners.clear();
    else if (listener === undefined) listeners.delete(event);
    else listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== listener));
    return fakeSocket;
  },
  emit: vi.fn(),
};

vi.mock('../realtime/socket', () => ({
  getSocket: vi.fn(() => fakeSocket),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  emitWhenReady: vi.fn(),
}));

const { useChatStore } = await import('./chatStore');

describe('chatStore: подписка на сокет не снимает чужих слушателей', () => {
  beforeEach(() => {
    listeners.clear();
    useChatStore.getState().reset();
  });

  it('слушатель connect из socket.ts переживает повторные подписки', () => {
    const statusListener: Listener = vi.fn();
    fakeSocket.on('connect', statusListener);

    useChatStore.getState().subscribeToSocket('me');
    useChatStore.getState().subscribeToSocket('me');

    const connect = listeners.get('connect') ?? [];
    expect(connect).toContain(statusListener);
    expect(connect).toHaveLength(2);
  });
});
