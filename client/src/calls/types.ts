import type { CallDto } from '@messenger/shared';

export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'active' | 'ended';

export type AudioRoute = 'earpiece' | 'speaker';

export interface CallParticipantState {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isSpeaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
}

export interface CallState {
  phase: CallPhase;
  call: CallDto | null;
  participants: CallParticipantState[];
  activeSpeakerId: string | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  audioRoute: AudioRoute;
  connectionQuality: 'good' | 'poor' | 'lost';
  startedAt: number | null;
  error: string | null;
}

export interface CallTransportCallbacks {
  onParticipantsChanged: (participants: CallParticipantState[]) => void;
  onActiveSpeakerChanged: (userId: string | null) => void;
  onConnectionQualityChanged: (quality: 'good' | 'poor' | 'lost') => void;
  onDisconnected: () => void;
}

export interface CallTransport {
  connect: (url: string, token: string, callbacks: CallTransportCallbacks) => Promise<void>;
  disconnect: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  setAudioRoute: (route: AudioRoute) => void;
  attachVideo: (userId: string, element: HTMLVideoElement) => void;
  detachVideo: (userId: string) => void;
}
