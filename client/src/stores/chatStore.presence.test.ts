import { PRESENCE_CONFIRM_MS, SocketEvent, type UserPresenceEvent } from '@messenger/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const handlers = new Map<string, (payload?: unknown) => void>();

const fakeSocket = {
  on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
    handlers.set(event, handler);
    return fakeSocket;
  }),
  off: vi.fn(() => fakeSocket),
  emit: vi.fn(),
};

vi.mock('../realtime/socket', () => ({
  getSocket: vi.fn(() => fakeSocket),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  emitWhenReady: vi.fn(),
}));

const { useChatStore } = await import('./chatStore');

const LAST_SEEN = '2026-09-25T10:00:00.000Z';

function receivePresence(userId: string, online: boolean): void {
  const event: UserPresenceEvent = { userId, online, lastSeenAt: LAST_SEEN };
  handlers.get(SocketEvent.UserPresence)?.(event);
}

describe('chatStore: снимок presence после переподключения', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.getState().reset();
    handlers.clear();
    useChatStore.getState().subscribeToSocket('me');
    receivePresence('gone', true);
    receivePresence('stayed', true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ушедший за время разрыва гаснет через 3 с со своим lastSeenAt', () => {
    useChatStore.getState().expectPresenceSnapshot();
    receivePresence('stayed', true);

    vi.advanceTimersByTime(PRESENCE_CONFIRM_MS - 1);
    expect(useChatStore.getState().presenceByUser.gone?.online).toBe(true);

    vi.advanceTimersByTime(1);
    expect(useChatStore.getState().presenceByUser.gone).toEqual({ online: false, lastSeenAt: LAST_SEEN });
    expect(useChatStore.getState().presenceByUser.stayed?.online).toBe(true);
  });

  it('без переподключения никто не гаснет', () => {
    vi.advanceTimersByTime(PRESENCE_CONFIRM_MS * 2);
    expect(useChatStore.getState().presenceByUser.gone?.online).toBe(true);
  });
});
