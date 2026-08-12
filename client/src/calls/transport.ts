import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type Participant,
  type RemoteVideoTrack,
} from 'livekit-client';

import type { CallParticipantState, CallTransport, CallTransportCallbacks } from './types';

let room: Room | null = null;

function mapConnectionQuality(quality: ConnectionQuality): 'good' | 'poor' | 'lost' {
  if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) return 'good';
  if (quality === ConnectionQuality.Poor) return 'poor';
  return 'lost';
}

function toParticipantState(participant: Participant): CallParticipantState {
  return {
    userId: participant.identity,
    displayName: participant.name || participant.identity,
    avatarUrl: null,
    isSpeaking: participant.isSpeaking,
    micEnabled: participant.isMicrophoneEnabled,
    cameraEnabled: participant.isCameraEnabled,
    screenShareEnabled: participant.isScreenShareEnabled,
  };
}

function collectParticipants(activeRoom: Room): CallParticipantState[] {
  const participants = [toParticipantState(activeRoom.localParticipant)];
  for (const participant of activeRoom.remoteParticipants.values()) {
    participants.push(toParticipantState(participant));
  }
  return participants;
}

function attachRoomListeners(activeRoom: Room, callbacks: CallTransportCallbacks): void {
  const notifyParticipants = (): void => callbacks.onParticipantsChanged(collectParticipants(activeRoom));

  activeRoom
    .on(RoomEvent.ParticipantConnected, notifyParticipants)
    .on(RoomEvent.ParticipantDisconnected, notifyParticipants)
    .on(RoomEvent.TrackSubscribed, notifyParticipants)
    .on(RoomEvent.TrackUnsubscribed, notifyParticipants)
    .on(RoomEvent.TrackMuted, notifyParticipants)
    .on(RoomEvent.TrackUnmuted, notifyParticipants)
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      callbacks.onActiveSpeakerChanged(speakers[0]?.identity ?? null);
      notifyParticipants();
    })
    .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
      if (participant.identity !== activeRoom.localParticipant.identity) return;
      callbacks.onConnectionQualityChanged(mapConnectionQuality(quality));
    })
    .on(RoomEvent.Disconnected, () => {
      room = null;
      callbacks.onDisconnected();
    });
}

async function captureMicrophoneTrack(): Promise<LocalAudioTrack | null> {
  try {
    return await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
  } catch {
    return null;
  }
}

async function connect(url: string, token: string, callbacks: CallTransportCallbacks): Promise<void> {
  const activeRoom = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
  });
  attachRoomListeners(activeRoom, callbacks);

  const micTrack = await captureMicrophoneTrack();

  await activeRoom.connect(url, token);
  room = activeRoom;

  if (micTrack) {
    try {
      await activeRoom.localParticipant.publishTrack(micTrack);
    } catch {
      micTrack.stop();
    }
  }

  callbacks.onParticipantsChanged(collectParticipants(activeRoom));
}

async function disconnect(): Promise<void> {
  const activeRoom = room;
  room = null;
  await activeRoom?.disconnect();
}

async function setMicrophoneEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(enabled);
}

async function setCameraEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setCameraEnabled(enabled);
}

async function setScreenShareEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setScreenShareEnabled(enabled);
}

function findParticipant(userId: string): Participant | undefined {
  if (!room) return undefined;
  if (room.localParticipant.identity === userId) return room.localParticipant;
  return room.remoteParticipants.get(userId);
}

function findVideoTrack(participant: Participant): LocalVideoTrack | RemoteVideoTrack | undefined {
  return (
    participant.getTrackPublication(Track.Source.Camera)?.videoTrack ??
    participant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack
  );
}

function attachVideo(userId: string, element: HTMLVideoElement): void {
  const participant = findParticipant(userId);
  if (!participant) return;
  findVideoTrack(participant)?.attach(element);
}

function detachVideo(userId: string): void {
  const participant = findParticipant(userId);
  if (!participant) return;
  findVideoTrack(participant)?.detach();
}

export const liveKitTransport: CallTransport = {
  connect,
  disconnect,
  setMicrophoneEnabled,
  setCameraEnabled,
  setScreenShareEnabled,
  attachVideo,
  detachVideo,
};
