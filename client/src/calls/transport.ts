import {
  ConnectionQuality,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type LocalVideoTrack,
  type Participant,
  type RemoteAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from 'livekit-client';

import { registerAudioTrack, resetAudioRouting, setAudioRoute, unregisterAudioTrack } from './audioRoute';
import type { CallParticipantState, CallTransport, CallTransportCallbacks, CallVideoSource } from './types';

const CAMERA_MAX_BITRATE = 3_000_000;
const CAMERA_MAX_FRAMERATE = 30;
const CAMERA_CAPTURE_OPTIONS: VideoCaptureOptions = { resolution: VideoPresets.h720.resolution };

const SCREEN_SHARE_CAPTURE_OPTIONS: ScreenShareCaptureOptions = {
  audio: false,
  contentHint: 'detail',
  resolution: ScreenSharePresets.h1080fps15.resolution,
  selfBrowserSurface: 'include',
  surfaceSwitching: 'include',
};

const SCREEN_SHARE_PUBLISH_OPTIONS: TrackPublishOptions = {
  videoCodec: 'h264',
  simulcast: false,
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  degradationPreference: 'maintain-resolution',
};

const FACING_MODE_ATTRIBUTE = 'facingMode';

let room: Room | null = null;
let activeCallbacks: CallTransportCallbacks | null = null;
let cameraFacingMode: 'user' | 'environment' = 'user';
const audioElements = new Map<string, HTMLAudioElement>();

export function getActiveRoom(): Room | null {
  return room;
}

function mapConnectionQuality(quality: ConnectionQuality): 'good' | 'poor' | 'lost' {
  if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) return 'good';
  if (quality === ConnectionQuality.Poor) return 'poor';
  return 'lost';
}

function isMirrored(participant: Participant): boolean {
  if (participant.isLocal) return cameraFacingMode === 'user';
  return participant.attributes[FACING_MODE_ATTRIBUTE] !== 'environment';
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
    mirrored: isMirrored(participant),
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
    .on(RoomEvent.TrackPublished, notifyParticipants)
    .on(RoomEvent.TrackUnpublished, notifyParticipants)
    .on(RoomEvent.ParticipantAttributesChanged, notifyParticipants)
    .on(RoomEvent.TrackMuted, notifyParticipants)
    .on(RoomEvent.TrackUnmuted, notifyParticipants)
    .on(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) callbacks.onScreenShareChanged(true);
      notifyParticipants();
    })
    .on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) callbacks.onScreenShareChanged(false);
      notifyParticipants();
    })
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

async function publishFacingMode(activeRoom: Room): Promise<void> {
  try {
    await activeRoom.localParticipant.setAttributes({ [FACING_MODE_ATTRIBUTE]: cameraFacingMode });
  } catch {
    return;
  }
}

async function connect(url: string, token: string, callbacks: CallTransportCallbacks): Promise<void> {
  const activeRoom = new Room({
    adaptiveStream: { pixelDensity: 'screen' },
    dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    videoCaptureDefaults: CAMERA_CAPTURE_OPTIONS,
    publishDefaults: {
      videoCodec: 'h264',
      simulcast: false,
      videoEncoding: {
        maxBitrate: CAMERA_MAX_BITRATE,
        maxFramerate: CAMERA_MAX_FRAMERATE,
        priority: 'high',
      },
      degradationPreference: 'maintain-framerate',
    },
  });
  attachRoomListeners(activeRoom, callbacks);

  const micTrack = await captureMicrophoneTrack();

  await activeRoom.connect(url, token);
  room = activeRoom;
  activeCallbacks = callbacks;
  await publishFacingMode(activeRoom);

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
  activeCallbacks = null;
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
  await (cameraTrack as LocalVideoTrack).restartTrack({ ...CAMERA_CAPTURE_OPTIONS, facingMode: nextFacingMode });
  cameraFacingMode = nextFacingMode;
  activeCallbacks?.onParticipantsChanged(collectParticipants(activeRoom));
  await publishFacingMode(activeRoom);
}

function isScreenShareSupported(): boolean {
  return typeof navigator?.mediaDevices?.getDisplayMedia === 'function';
}

async function setScreenShareEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setScreenShareEnabled(enabled, SCREEN_SHARE_CAPTURE_OPTIONS, SCREEN_SHARE_PUBLISH_OPTIONS);
}

async function changeScreenShareSource(): Promise<void> {
  const screenTrack = room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
  if (!screenTrack) return;
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const [nextTrack] = stream.getVideoTracks();
  if (!nextTrack) return;
  nextTrack.contentHint = 'detail';
  await (screenTrack as LocalVideoTrack).replaceTrack(nextTrack, { userProvidedTrack: false });
}

function findParticipant(userId: string): Participant | undefined {
  if (!room) return undefined;
  if (room.localParticipant.identity === userId) return room.localParticipant;
  return room.remoteParticipants.get(userId);
}

function findVideoTrack(participant: Participant, source: CallVideoSource): LocalVideoTrack | RemoteVideoTrack | undefined {
  const trackSource = source === 'screen' ? Track.Source.ScreenShare : Track.Source.Camera;
  return participant.getTrackPublication(trackSource)?.videoTrack;
}

function attachVideo(userId: string, element: HTMLVideoElement, source: CallVideoSource): void {
  const participant = findParticipant(userId);
  if (!participant) return;
  findVideoTrack(participant, source)?.attach(element);
}

function detachVideo(userId: string, element: HTMLVideoElement, source: CallVideoSource): void {
  const participant = findParticipant(userId);
  if (!participant) return;
  findVideoTrack(participant, source)?.detach(element);
}

export const liveKitTransport: CallTransport = {
  connect,
  disconnect,
  setMicrophoneEnabled,
  setAudioRoute,
  setCameraEnabled,
  flipCamera,
  isScreenShareSupported,
  setScreenShareEnabled,
  changeScreenShareSource,
  attachVideo,
  detachVideo,
};
