import type {
  CallAcceptAck,
  CallAccessDto,
  CallActionPayload,
  CallDto,
  CallKind,
  CallParticipantDto,
  CallStartAck,
  CallStartPayload,
} from '@messenger/shared';
import { SocketEvent } from '@messenger/shared';
import type { Socket } from 'socket.io-client';
import { create } from 'zustand';

import { liveKitTransport } from '../calls/transport';
import type { CallParticipantState, CallState, CallTransport } from '../calls/types';
import { getSocket } from '../realtime/socket';

const CALL_ENDED_RESET_DELAY_MS = 2000;
const CAMERA_ERROR_DISPLAY_MS = 3000;

let transport: CallTransport = liveKitTransport;

export function setCallTransport(next: CallTransport): void {
  transport = next;
}

function emitWithAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function toParticipantState(participant: CallParticipantDto): CallParticipantState {
  return {
    userId: participant.user.id,
    displayName: participant.user.displayName,
    avatarUrl: participant.user.avatarUrl,
    isSpeaking: false,
    micEnabled: true,
    cameraEnabled: false,
    screenShareEnabled: false,
  };
}

function toParticipantStates(participants: CallParticipantDto[]): CallParticipantState[] {
  return participants.filter((participant) => participant.leftAt === null).map(toParticipantState);
}

function mergeParticipants(
  existing: CallParticipantState[],
  participants: CallParticipantDto[],
): CallParticipantState[] {
  const byId = new Map(existing.map((participant) => [participant.userId, participant]));
  return participants
    .filter((participant) => participant.leftAt === null)
    .map((participant) => byId.get(participant.user.id) ?? toParticipantState(participant));
}

const initialState: CallState = {
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
};

interface CallStoreState extends CallState {
  startCall: (chatId: string, kind: CallKind) => Promise<void>;
  joinCall: (callId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleAudioRoute: () => void;
  attachParticipantVideo: (userId: string, element: HTMLVideoElement) => void;
  detachParticipantVideo: (userId: string) => void;
  applyInvite: (call: CallDto) => void;
  applyEnded: (call: CallDto) => void;
  applyCallUpdate: (call: CallDto) => void;
}

export const useCallStore = create<CallStoreState>((set, get) => {
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  let cameraErrorTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleReset(): void {
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetTimer = null;
      if (get().phase === 'ended') set(initialState);
    }, CALL_ENDED_RESET_DELAY_MS);
  }

  function scheduleCameraErrorClear(): void {
    if (cameraErrorTimer) clearTimeout(cameraErrorTimer);
    cameraErrorTimer = setTimeout(() => {
      cameraErrorTimer = null;
      set({ cameraError: null });
    }, CAMERA_ERROR_DISPLAY_MS);
  }

  async function connectToRoom(access: CallAccessDto): Promise<boolean> {
    try {
      await transport.connect(access.url, access.token, {
        onParticipantsChanged: (participants) => set({ participants }),
        onActiveSpeakerChanged: (activeSpeakerId) => set({ activeSpeakerId }),
        onConnectionQualityChanged: (connectionQuality) => set({ connectionQuality }),
        onDisconnected: () => {
          if (get().phase === 'idle' || get().phase === 'ended') return;
          set({ phase: 'ended' });
          scheduleReset();
        },
      });
      return true;
    } catch (error) {
      set({ ...initialState, error: error instanceof Error ? error.message : 'Не удалось подключиться к звонку' });
      return false;
    }
  }

  return {
    ...initialState,

    async startCall(chatId, kind) {
      if (get().phase !== 'idle') return;
      const socket = getSocket();
      if (!socket) {
        set({ error: 'Нет соединения' });
        return;
      }
      set({ phase: 'outgoing', error: null });
      const payload: CallStartPayload = { chatId, kind };
      const ack = await emitWithAck<CallStartAck>(socket, SocketEvent.CallStart, payload);
      if (!ack.ok || !ack.access) {
        set({ ...initialState, error: ack.error?.message ?? 'Не удалось начать звонок' });
        return;
      }
      set({ call: ack.access.call, participants: toParticipantStates(ack.access.call.participants) });
      await connectToRoom(ack.access);
    },

    async joinCall(callId) {
      if (get().phase !== 'idle') return;
      const socket = getSocket();
      if (!socket) {
        set({ error: 'Нет соединения' });
        return;
      }
      const payload: CallActionPayload = { callId };
      const ack = await emitWithAck<CallAcceptAck>(socket, SocketEvent.CallAccept, payload);
      if (!ack.ok || !ack.access) {
        set({ error: ack.error?.message ?? 'Не удалось присоединиться к звонку' });
        return;
      }
      set({ call: ack.access.call, participants: toParticipantStates(ack.access.call.participants) });
      const connected = await connectToRoom(ack.access);
      if (connected) set({ phase: 'active', startedAt: Date.now() });
    },

    async acceptCall() {
      const { call, phase } = get();
      if (!call || phase !== 'incoming') return;
      const socket = getSocket();
      if (!socket) return;
      const payload: CallActionPayload = { callId: call.id };
      const ack = await emitWithAck<CallAcceptAck>(socket, SocketEvent.CallAccept, payload);
      if (!ack.ok || !ack.access) {
        set({ error: ack.error?.message ?? 'Не удалось принять звонок' });
        return;
      }
      set({ call: ack.access.call, participants: toParticipantStates(ack.access.call.participants) });
      const connected = await connectToRoom(ack.access);
      if (connected) set({ phase: 'active', startedAt: Date.now() });
    },

    async declineCall() {
      const { call, phase } = get();
      if (!call || phase !== 'incoming') return;
      const payload: CallActionPayload = { callId: call.id };
      getSocket()?.emit(SocketEvent.CallDecline, payload);
      set(initialState);
    },

    async hangUp() {
      const { call, phase } = get();
      if (call && phase !== 'incoming') {
        const payload: CallActionPayload = { callId: call.id };
        getSocket()?.emit(SocketEvent.CallLeave, payload);
      }
      await transport.disconnect();
      set(initialState);
    },

    async toggleMic() {
      const next = !get().micEnabled;
      set({ micEnabled: next });
      await transport.setMicrophoneEnabled(next);
    },

    async toggleCamera() {
      const next = !get().cameraEnabled;
      try {
        await transport.setCameraEnabled(next);
        set({ cameraEnabled: next });
      } catch {
        set({ cameraError: 'Нет доступа к камере' });
        scheduleCameraErrorClear();
      }
    },

    async toggleScreenShare() {
      const next = !get().screenShareEnabled;
      set({ screenShareEnabled: next });
      await transport.setScreenShareEnabled(next);
    },

    toggleAudioRoute() {
      const next = get().audioRoute === 'speaker' ? 'earpiece' : 'speaker';
      set({ audioRoute: next });
      transport.setAudioRoute(next);
    },

    attachParticipantVideo(userId, element) {
      transport.attachVideo(userId, element);
    },

    detachParticipantVideo(userId) {
      transport.detachVideo(userId);
    },

    applyInvite(call) {
      if (get().phase !== 'idle') return;
      set({ phase: 'incoming', call, participants: toParticipantStates(call.participants), error: null });
    },

    applyEnded(call) {
      const state = get();
      if (state.call?.id !== call.id) return;
      void transport.disconnect();
      if (state.phase !== 'active') {
        set(initialState);
        return;
      }
      set({ phase: 'ended', call });
      scheduleReset();
    },

    applyCallUpdate(call) {
      const state = get();
      if (state.call?.id !== call.id) return;
      const becameActive = state.phase === 'outgoing' && call.status === 'ACTIVE';
      set({
        call,
        participants: mergeParticipants(state.participants, call.participants),
        phase: becameActive ? 'active' : state.phase,
        startedAt: becameActive ? Date.now() : state.startedAt,
      });
    },
  };
});
