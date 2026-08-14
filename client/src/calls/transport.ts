import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type Participant,
  type RemoteAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
} from 'livekit-client';

import { registerAudioTrack, resetAudioRouting, setAudioRoute, unregisterAudioTrack } from './audioRoute';
import type { CallParticipantState, CallTransport, CallTransportCallbacks } from './types';

let room: Room | null = null;
let cameraFacingMode: 'user' | 'environment' = 'user';
const audioElements = new Map<string, HTMLAudioElement>();

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

function attachRemoteAudio(track: RemoteTrack, publication: RemoteTrackPublication): void {
  if (track.kind !== Track.Kind.Audio) return;
  const audioTrack = track as RemoteAudioTrack;
  const element = audioTrack.attach() as HTMLAudioElement;
  element.autoplay = true;
  document.body.appendChild(element);
  audioElements.set(publication.trackSid, element);
  registerAudioTrack(audioTrack);
}

function detachRemoteAudio(track: RemoteTrack, publication: RemoteTrackPublication): void {
  if (track.kind !== Track.Kind.Audio) return;
  unregisterAudioTrack(track as RemoteAudioTrack);
  track.detach().forEach((element) => element.remove());
  audioElements.delete(publication.trackSid);
}

function attachRoomListeners(activeRoom: Room, callbacks: CallTransportCallbacks): void {
  const notifyParticipants = (): void => callbacks.onParticipantsChanged(collectParticipants(activeRoom));

  activeRoom
    .on(RoomEvent.ParticipantConnected, notifyParticipants)
    .on(RoomEvent.ParticipantDisconnected, notifyParticipants)
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication) => {
      attachRemoteAudio(track, publication);
      notifyParticipants();
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication) => {
      detachRemoteAudio(track, publication);
      notifyParticipants();
    })
    .on(RoomEvent.TrackMuted, notifyParticipants)
    .on(RoomEvent.TrackUnmuted, notifyParticipants)
    .on(RoomEvent.LocalTrackPublished, notifyParticipants)
    .on(RoomEvent.LocalTrackUnpublished, notifyParticipants)
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
  cameraFacingMode = 'user';
  resetAudioRouting();
  audioElements.forEach((element) => element.remove());
  audioElements.clear();
  await activeRoom?.disconnect();
}

async function setMicrophoneEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(enabled);
}

async function setCameraEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setCameraEnabled(enabled);
}

async function flipCamera(): Promise<void> {
  const activeRoom = room;
  if (!activeRoom) return;
  const cameraTrack = activeRoom.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
  if (!cameraTrack) return;
  const nextFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
  await (cameraTrack as LocalVideoTrack).restartTrack({ facingMode: nextFacingMode });
  cameraFacingMode = nextFacingMode;
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
  setAudioRoute,
  setCameraEnabled,
  flipCamera,
  setScreenShareEnabled,
  attachVideo,
  detachVideo,
};
