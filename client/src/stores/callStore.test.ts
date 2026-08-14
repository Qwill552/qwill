import type { CallAcceptAck, CallDto } from '@messenger/shared';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallTransport } from '../calls/types';
import { getSocket } from '../realtime/socket';
import { setCallTransport, useCallStore } from './callStore';

vi.mock('../realtime/socket', () => ({ getSocket: vi.fn() }));

function buildCall(overrides: Partial<CallDto> = {}): CallDto {
  return {
    id: 'call-1',
    chatId: 'chat-1',
    initiator: null,
    kind: 'AUDIO',
    status: 'RINGING',
    startedAt: null,
    endedAt: null,
    participants: [],
    ...overrides,
  };
}

function stubTransport(overrides: Partial<CallTransport> = {}): CallTransport {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    setCameraEnabled: vi.fn().mockResolvedValue(undefined),
    setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
    setAudioRoute: vi.fn(),
    attachVideo: vi.fn(),
    detachVideo: vi.fn(),
    ...overrides,
  };
}

function resetStore(): void {
  useCallStore.setState({
    phase: 'idle',
    call: null,
    participants: [],
    activeSpeakerId: null,
    micEnabled: true,
    cameraEnabled: false,
    screenShareEnabled: false,
    audioRoute: 'earpiece',
    connectionQuality: 'good',
    startedAt: null,
    error: null,
  });
}

describe('callStore', () => {
  beforeEach(() => {
    resetStore();
    setCallTransport(stubTransport());
    vi.mocked(getSocket).mockReturnValue(undefined as unknown as Socket);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('входящее приглашение переводит phase в incoming', () => {
    const call = buildCall();

    useCallStore.getState().applyInvite(call);

    expect(useCallStore.getState().phase).toBe('incoming');
    expect(useCallStore.getState().call).toEqual(call);
  });

  it('отклонение возвращает phase в idle и очищает call', () => {
    const emit = vi.fn();
    vi.mocked(getSocket).mockReturnValue({ emit } as unknown as Socket);
    useCallStore.getState().applyInvite(buildCall());

    void useCallStore.getState().declineCall();

    expect(useCallStore.getState().phase).toBe('idle');
    expect(useCallStore.getState().call).toBeNull();
    expect(emit).toHaveBeenCalledWith('call:decline', { callId: 'call-1' });
  });

  it('принятие переводит в active и проставляет startedAt', async () => {
    const access = { call: buildCall({ status: 'ACTIVE' }), token: 'token', url: 'wss://example' };
    const ack: CallAcceptAck = { ok: true, access };
    const emit = vi.fn((_event: string, _payload: unknown, callback: (ack: CallAcceptAck) => void) => {
      callback(ack);
    });
    vi.mocked(getSocket).mockReturnValue({ emit } as unknown as Socket);
    useCallStore.getState().applyInvite(buildCall());

    await useCallStore.getState().acceptCall();

    expect(useCallStore.getState().phase).toBe('active');
    expect(useCallStore.getState().startedAt).not.toBeNull();
  });

  it('call:ended из любой фазы переводит в ended, затем в idle', () => {
    vi.useFakeTimers();
    useCallStore.setState({ phase: 'active', call: buildCall({ status: 'ACTIVE' }) });

    useCallStore.getState().applyEnded(buildCall({ status: 'ENDED' }));
    expect(useCallStore.getState().phase).toBe('ended');

    vi.runAllTimers();
    expect(useCallStore.getState().phase).toBe('idle');
  });

  it('toggleMic инвертирует micEnabled и зовёт транспорт ровно один раз', async () => {
    const transport = stubTransport();
    setCallTransport(transport);
    expect(useCallStore.getState().micEnabled).toBe(true);

    await useCallStore.getState().toggleMic();

    expect(useCallStore.getState().micEnabled).toBe(false);
    expect(transport.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(transport.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('приглашение во время активного звонка игнорируется, phase не меняется', () => {
    const activeCall = buildCall({ id: 'call-active', status: 'ACTIVE' });
    useCallStore.setState({ phase: 'active', call: activeCall });

    useCallStore.getState().applyInvite(buildCall({ id: 'call-other' }));

    expect(useCallStore.getState().phase).toBe('active');
    expect(useCallStore.getState().call).toEqual(activeCall);
  });
});
