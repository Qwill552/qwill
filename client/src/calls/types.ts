import type { CallDto } from '@messenger/shared';

export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'active' | 'ended';

export const GROUP_CALL_GRID_MAX_PARTICIPANTS = 8;
export const GROUP_CALL_GRID_ROW_MAX = 3;

export type AudioRoute = 'earpiece' | 'speaker';

export type CallVideoSource = 'camera' | 'screen';

export interface CallParticipantState {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isSpeaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  mirrored: boolean;
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
  cameraError: string | null;
}

export interface CallTransportCallbacks {
  onParticipantsChanged: (participants: CallParticipantState[]) => void;
  onActiveSpeakerChanged: (userId: string | null) => void;
  onConnectionQualityChanged: (quality: 'good' | 'poor' | 'lost') => void;
  onScreenShareChanged: (enabled: boolean) => void;
  onDisconnected: () => void;
}

export interface CallTransport {
  connect: (url: string, token: string, callbacks: CallTransportCallbacks) => Promise<void>;
  disconnect: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  flipCamera: () => Promise<void>;
  isScreenShareSupported: () => boolean;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  changeScreenShareSource: () => Promise<void>;
  setAudioRoute: (route: AudioRoute) => void;
  attachVideo: (userId: string, element: HTMLVideoElement, source: CallVideoSource) => void;
  detachVideo: (userId: string, element: HTMLVideoElement, source: CallVideoSource) => void;
}
