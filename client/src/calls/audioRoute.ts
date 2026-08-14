import type { RemoteAudioTrack } from 'livekit-client';

import type { AudioRoute } from './types';

const EARPIECE_VOLUME = 0.45;
const SPEAKER_GAIN = 2;
const COMPRESSOR_THRESHOLD_DB = -18;
const COMPRESSOR_KNEE_DB = 12;
const COMPRESSOR_RATIO = 6;
const COMPRESSOR_ATTACK_SEC = 0.003;
const COMPRESSOR_RELEASE_SEC = 0.15;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionType = 'auto' | 'play-and-record' | 'playback';
type AudioSessionNavigator = Navigator & { audioSession?: { type: AudioSessionType } };

let route: AudioRoute = 'earpiece';
let audioContext: AudioContext | null = null;
let audioSessionUsable = true;
const tracks = new Set<RemoteAudioTrack>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

function createLoudnessCompressor(context: AudioContext): DynamicsCompressorNode {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR_THRESHOLD_DB;
  compressor.knee.value = COMPRESSOR_KNEE_DB;
  compressor.ratio.value = COMPRESSOR_RATIO;
  compressor.attack.value = COMPRESSOR_ATTACK_SEC;
  compressor.release.value = COMPRESSOR_RELEASE_SEC;
  return compressor;
}

function applyAudioSession(): void {
  if (!audioSessionUsable || typeof navigator === 'undefined') return;
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (!session) return;
  try {
    session.type = route === 'earpiece' ? 'play-and-record' : 'auto';
  } catch {
    audioSessionUsable = false;
  }
}

function silenceElements(track: RemoteAudioTrack): void {
  track.attachedElements.forEach((element) => {
    element.muted = true;
    element.volume = 0;
  });
}

function unsilenceElements(track: RemoteAudioTrack): void {
  track.attachedElements.forEach((element) => {
    element.muted = false;
  });
}

function routeThroughWebAudio(track: RemoteAudioTrack, context: AudioContext): void {
  track.setWebAudioPlugins([createLoudnessCompressor(context)]);
  track.setAudioContext(context);
  silenceElements(track);
  track.setVolume(SPEAKER_GAIN);
  if (context.state !== 'running') void context.resume().catch(() => undefined);
}

function routeThroughElement(track: RemoteAudioTrack, volume: number): void {
  track.setAudioContext(undefined);
  track.setWebAudioPlugins([]);
  unsilenceElements(track);
  track.setVolume(volume);
}

function applyRoute(track: RemoteAudioTrack): void {
  if (route === 'speaker') {
    const context = getAudioContext();
    if (context) {
      routeThroughWebAudio(track, context);
      return;
    }
    routeThroughElement(track, 1);
    return;
  }
  routeThroughElement(track, EARPIECE_VOLUME);
}

export function getAudioRoute(): AudioRoute {
  return route;
}

export function setAudioRoute(next: AudioRoute): void {
  route = next;
  applyAudioSession();
  tracks.forEach(applyRoute);
}

export function registerAudioTrack(track: RemoteAudioTrack): void {
  tracks.add(track);
  applyAudioSession();
  applyRoute(track);
}

export function unregisterAudioTrack(track: RemoteAudioTrack): void {
  tracks.delete(track);
}

export function resetAudioRouting(): void {
  tracks.clear();
  route = 'earpiece';
  applyAudioSession();
}
