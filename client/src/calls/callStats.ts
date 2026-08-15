import { Track } from 'livekit-client';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

import { getActiveRoom } from './transport';

export interface OutboundVideoStats {
  layer: string;
  width: number;
  height: number;
  fps: number;
  kbps: number;
  qp: number;
  limitation: string;
  encoder: string;
}

export interface InboundVideoStats {
  width: number;
  height: number;
  fps: number;
  kbps: number;
  freezes: number;
  packetsLost: number;
}

export interface TransportStats {
  protocol: string;
  localCandidate: string;
  remoteCandidate: string;
  rttMs: number;
  availableOutgoingKbps: number;
}

export interface CallStatsSnapshot {
  captureWidth: number;
  captureHeight: number;
  captureFps: number;
  captureMax: string;
  codec: string;
  outbound: OutboundVideoStats[];
  inbound: InboundVideoStats[];
  transport: TransportStats | null;
}

interface RtpStatsEntry {
  id: string;
  type: string;
  kind?: string;
  timestamp: number;
  rid?: string;
  codecId?: string;
  bytesSent?: number;
  bytesReceived?: number;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  qualityLimitationReason?: string;
  encoderImplementation?: string;
  qpSum?: number;
  framesEncoded?: number;
  freezeCount?: number;
  packetsLost?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  nominated?: boolean;
  state?: string;
  protocol?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  currentRoundTripTime?: number;
  availableOutgoingBitrate?: number;
  candidateType?: string;
  relayProtocol?: string;
}

const byteHistory = new Map<string, { bytes: number; timestamp: number }>();
const qpHistory = new Map<string, { qpSum: number; frames: number }>();

function kbpsFor(key: string, bytes: number, timestamp: number): number {
  const previous = byteHistory.get(key);
  byteHistory.set(key, { bytes, timestamp });
  if (!previous || timestamp <= previous.timestamp) return 0;
  return Math.round(((bytes - previous.bytes) * 8) / (timestamp - previous.timestamp));
}

function averageQpFor(key: string, qpSum: number, frames: number): number {
  const previous = qpHistory.get(key);
  qpHistory.set(key, { qpSum, frames });
  if (!previous || frames <= previous.frames) return 0;
  return Math.round((qpSum - previous.qpSum) / (frames - previous.frames));
}

function entriesOf(report: RTCStatsReport): RtpStatsEntry[] {
  const entries: RtpStatsEntry[] = [];
  report.forEach((value) => entries.push(value as RtpStatsEntry));
  return entries;
}

function codecOf(entries: RtpStatsEntry[], codecId: string | undefined): string {
  if (!codecId) return '—';
  const codec = entries.find((entry) => entry.id === codecId);
  return codec?.mimeType?.replace('video/', '') ?? '—';
}

interface CandidateInfo {
  label: string;
  protocol: string;
}

function candidateInfo(entries: RtpStatsEntry[], candidateId: string | undefined): CandidateInfo {
  const candidate = entries.find((entry) => entry.id === candidateId);
  if (!candidate) return { label: '?', protocol: '?' };
  const relay = candidate.relayProtocol ? `/${candidate.relayProtocol}` : '';
  return {
    label: `${candidate.candidateType ?? '?'}${relay}`,
    protocol: (candidate.relayProtocol ?? candidate.protocol ?? '?').toUpperCase(),
  };
}

function selectedPair(entries: RtpStatsEntry[]): RtpStatsEntry | undefined {
  const pairs = entries.filter((entry) => entry.type === 'candidate-pair');
  return pairs.find((pair) => pair.nominated && pair.state === 'succeeded') ?? pairs[0];
}

function readTransport(entries: RtpStatsEntry[]): TransportStats | null {
  const pair = selectedPair(entries);
  if (!pair) return null;
  const local = candidateInfo(entries, pair.localCandidateId);
  const remote = candidateInfo(entries, pair.remoteCandidateId);
  return {
    protocol: local.protocol,
    localCandidate: local.label,
    remoteCandidate: remote.label,
    rttMs: Math.round((pair.currentRoundTripTime ?? 0) * 1000),
    availableOutgoingKbps: Math.round((pair.availableOutgoingBitrate ?? 0) / 1000),
  };
}

function localVideoTrack(): LocalVideoTrack | undefined {
  return getActiveRoom()?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
}

function remoteVideoTracks(): (LocalVideoTrack | RemoteVideoTrack)[] {
  const room = getActiveRoom();
  if (!room) return [];
  const tracks: (LocalVideoTrack | RemoteVideoTrack)[] = [];
  for (const participant of room.remoteParticipants.values()) {
    const track = participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (track) tracks.push(track);
  }
  return tracks;
}

function captureCapability(): string {
  const track = localVideoTrack()?.mediaStreamTrack;
  if (!track || typeof track.getCapabilities !== 'function') return '—';
  const capabilities = track.getCapabilities();
  if (!capabilities.width?.max || !capabilities.height?.max) return '—';
  return `${capabilities.width.max}×${capabilities.height.max}`;
}

async function localAudioReport(): Promise<RTCStatsReport | undefined> {
  const track = getActiveRoom()?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
  return track?.getRTCStatsReport();
}

export async function collectCallStats(): Promise<CallStatsSnapshot | null> {
  const room = getActiveRoom();
  if (!room) return null;

  const snapshot: CallStatsSnapshot = {
    captureWidth: 0,
    captureHeight: 0,
    captureFps: 0,
    captureMax: captureCapability(),
    codec: '—',
    outbound: [],
    inbound: [],
    transport: null,
  };

  const publisherReport = (await localVideoTrack()?.getRTCStatsReport()) ?? (await localAudioReport());
  if (publisherReport) {
    const entries = entriesOf(publisherReport);
    snapshot.transport = readTransport(entries);

    const source = entries.find((entry) => entry.type === 'media-source' && entry.kind === 'video');
    if (source) {
      snapshot.captureWidth = source.width ?? 0;
      snapshot.captureHeight = source.height ?? 0;
      snapshot.captureFps = Math.round(source.framesPerSecond ?? 0);
    }

    for (const entry of entries) {
      if (entry.type !== 'outbound-rtp' || entry.kind !== 'video') continue;
      snapshot.codec = codecOf(entries, entry.codecId);
      snapshot.outbound.push({
        layer: entry.rid ?? 'single',
        width: entry.frameWidth ?? 0,
        height: entry.frameHeight ?? 0,
        fps: Math.round(entry.framesPerSecond ?? 0),
        kbps: kbpsFor(`out:${entry.id}`, entry.bytesSent ?? 0, entry.timestamp),
        qp: averageQpFor(`out:${entry.id}`, entry.qpSum ?? 0, entry.framesEncoded ?? 0),
        limitation: entry.qualityLimitationReason ?? '—',
        encoder: entry.encoderImplementation ?? '—',
      });
    }
    snapshot.outbound.sort((a, b) => a.height - b.height);
  }

  for (const track of remoteVideoTracks()) {
    const report = await track.getRTCStatsReport();
    if (!report) continue;
    const entries = entriesOf(report);
    if (!snapshot.transport) snapshot.transport = readTransport(entries);
    for (const entry of entries) {
      if (entry.type !== 'inbound-rtp' || entry.kind !== 'video') continue;
      snapshot.inbound.push({
        width: entry.frameWidth ?? 0,
        height: entry.frameHeight ?? 0,
        fps: Math.round(entry.framesPerSecond ?? 0),
        kbps: kbpsFor(`in:${entry.id}`, entry.bytesReceived ?? 0, entry.timestamp),
        freezes: entry.freezeCount ?? 0,
        packetsLost: entry.packetsLost ?? 0,
      });
    }
  }

  return snapshot;
}

export function resetCallStats(): void {
  byteHistory.clear();
  qpHistory.clear();
}
