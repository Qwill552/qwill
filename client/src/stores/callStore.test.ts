import type { CallAcceptAck, CallDto, CallStartAck } from '@messenger/shared';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallParticipantState, CallTransport, CallTransportCallbacks } from '../calls/types';
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
    flipCamera: vi.fn().mockResolvedValue(undefined),
    isScreenShareSupported: vi.fn().mockReturnValue(true),
    setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
    changeScreenShareSource: vi.fn().mockResolvedValue(undefined),
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
    cameraError: null,
    rejoinable: null,
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

  it('приглашение снимается, когда звонок принят на другом устройстве', () => {
    useCallStore.getState().applyInvite(buildCall());

    useCallStore.getState().clearInvite('call-1');

    expect(useCallStore.getState().phase).toBe('idle');
    expect(useCallStore.getState().call).toBeNull();
  });

  it('снятие чужого приглашения не трогает текущее', () => {
    useCallStore.getState().applyInvite(buildCall());

    useCallStore.getState().clearInvite('call-other');

    expect(useCallStore.getState().phase).toBe('incoming');
    expect(useCallStore.getState().call?.id).toBe('call-1');
  });

  it('снятие приглашения не трогает уже идущий разговор', async () => {
    const emit = vi.fn((_event: string, _payload: unknown, ack: (result: unknown) => void) => {
      ack({ ok: true, access: { call: buildCall({ status: 'ACTIVE' }), token: 't', url: 'wss://x' } });
    });
    vi.mocked(getSocket).mockReturnValue({ emit } as unknown as Socket);
    useCallStore.getState().applyInvite(buildCall());
    await useCallStore.getState().acceptCall();
    expect(useCallStore.getState().phase).toBe('active');

    useCallStore.getState().clearInvite('call-1');

    expect(useCallStore.getState().phase).toBe('active');
    expect(useCallStore.getState().call?.id).toBe('call-1');
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

  it('звонящий уходит в разговор только когда собеседник появился в комнате', async () => {
    const access = { call: buildCall(), token: 'token', url: 'wss://example' };
    const emit = vi.fn((_event: string, _payload: unknown, callback: (ack: CallStartAck) => void) => {
      callback({ ok: true, access });
    });
    vi.mocked(getSocket).mockReturnValue({ emit } as unknown as Socket);

    let callbacks: CallTransportCallbacks | undefined;
    setCallTransport(
      stubTransport({
        connect: vi.fn(async (_url: string, _token: string, incoming: CallTransportCallbacks) => {
          callbacks = incoming;
        }),
      }),
    );

    await useCallStore.getState().startCall('chat-1', 'AUDIO');
    expect(useCallStore.getState().phase).toBe('outgoing');

    useCallStore.getState().applyCallUpdate(buildCall({ status: 'ACTIVE' }));
    expect(useCallStore.getState().phase).toBe('outgoing');

    callbacks?.onParticipantsChanged([
      { userId: 'me' } as CallParticipantState,
      { userId: 'other' } as CallParticipantState,
    ]);

    expect(useCallStore.getState().phase).toBe('active');
    expect(useCallStore.getState().startedAt).not.toBeNull();
  });

  it('отклонение исходящего оставляет экран в ended с причиной, а не гасит сразу', () => {
    vi.useFakeTimers();
    useCallStore.setState({ phase: 'outgoing', call: buildCall() });

    useCallStore.getState().applyEnded(buildCall({ status: 'DECLINED' }));
    expect(useCallStore.getState().phase).toBe('ended');
    expect(useCallStore.getState().call?.status).toBe('DECLINED');

    vi.runAllTimers();
    expect(useCallStore.getState().phase).toBe('idle');
  });

  it('отмена звонящим закрывает экран входящего сразу, без фазы ended', () => {
    useCallStore.getState().applyInvite(buildCall());

    useCallStore.getState().applyEnded(buildCall({ status: 'MISSED' }));

    expect(useCallStore.getState().phase).toBe('idle');
    expect(useCallStore.getState().call).toBeNull();
  });

  it('живой звонок после перезапуска предлагается к возврату, а не подхватывается сам', () => {
    useCallStore.getState().applyLiveCalls([buildCall({ status: 'ACTIVE' })]);

    expect(useCallStore.getState().phase).toBe('idle');
    expect(useCallStore.getState().rejoinable?.id).toBe('call-1');
  });

  it('завершение звонка убирает предложение вернуться', () => {
    useCallStore.getState().applyLiveCalls([buildCall({ status: 'ACTIVE' })]);

    useCallStore.getState().applyEnded(buildCall({ status: 'ENDED' }));

    expect(useCallStore.getState().rejoinable).toBeNull();
  });

  it('идущий разговор не подменяется предложением вернуться', () => {
    useCallStore.setState({ phase: 'active', call: buildCall({ status: 'ACTIVE' }) });

    useCallStore.getState().applyLiveCalls([buildCall({ id: 'call-2', status: 'ACTIVE' })]);

    expect(useCallStore.getState().rejoinable).toBeNull();
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

  it('toggleCamera инвертирует cameraEnabled и зовёт транспорт ровно один раз', async () => {
    const transport = stubTransport();
    setCallTransport(transport);
    expect(useCallStore.getState().cameraEnabled).toBe(false);

    await useCallStore.getState().toggleCamera();

    expect(useCallStore.getState().cameraEnabled).toBe(true);
    expect(transport.setCameraEnabled).toHaveBeenCalledTimes(1);
    expect(transport.setCameraEnabled).toHaveBeenCalledWith(true);
  });

  it('отказ в доступе к камере не включает её и выставляет cameraError, который сам сбрасывается', async () => {
    vi.useFakeTimers();
    const transport = stubTransport({ setCameraEnabled: vi.fn().mockRejectedValue(new Error('denied')) });
    setCallTransport(transport);

    await useCallStore.getState().toggleCamera();

    expect(useCallStore.getState().cameraEnabled).toBe(false);
    expect(useCallStore.getState().cameraError).toBe('Нет доступа к камере');

    vi.runAllTimers();
    expect(useCallStore.getState().cameraError).toBeNull();
  });

  it('flipCamera при выключенной камере не трогает транспорт', async () => {
    const transport = stubTransport();
    setCallTransport(transport);

    await useCallStore.getState().flipCamera();

    expect(transport.flipCamera).not.toHaveBeenCalled();
  });

  it('недоступная вторая камера показывает cameraError и не роняет звонок', async () => {
    vi.useFakeTimers();
    const transport = stubTransport({ flipCamera: vi.fn().mockRejectedValue(new Error('overconstrained')) });
    setCallTransport(transport);
    useCallStore.setState({ phase: 'active', cameraEnabled: true });

    await useCallStore.getState().flipCamera();

    expect(useCallStore.getState().phase).toBe('active');
    expect(useCallStore.getState().cameraEnabled).toBe(true);
    expect(useCallStore.getState().cameraError).toBe('Вторая камера недоступна');

    vi.runAllTimers();
    expect(useCallStore.getState().cameraError).toBeNull();
  });

  it('приглашение во время активного звонка игнорируется, phase не меняется', () => {
    const activeCall = buildCall({ id: 'call-active', status: 'ACTIVE' });
    useCallStore.setState({ phase: 'active', call: activeCall });

    useCallStore.getState().applyInvite(buildCall({ id: 'call-other' }));

    expect(useCallStore.getState().phase).toBe('active');
    expect(useCallStore.getState().call).toEqual(activeCall);
  });
});
