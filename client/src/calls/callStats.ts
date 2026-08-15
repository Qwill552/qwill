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
  label: string;
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
  captureLabel: string;
  captureWidth: number;
  captureHeight: number;
  captureFps: number;
  captureTrack: string;
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

interface LabelledVideoTrack<T> {
  label: string;
  track: T;
}

function localVideoTracks(): LabelledVideoTrack<LocalVideoTrack>[] {
  const participant = getActiveRoom()?.localParticipant;
  if (!participant) return [];
  const screen = participant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
  const camera = participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
  const tracks: LabelledVideoTrack<LocalVideoTrack>[] = [];
  if (screen) tracks.push({ label: 'экран', track: screen });
  if (camera) tracks.push({ label: 'камера', track: camera });
  return tracks;
}

function remoteVideoTracks(): LabelledVideoTrack<LocalVideoTrack | RemoteVideoTrack>[] {
  const room = getActiveRoom();
  if (!room) return [];
  const tracks: LabelledVideoTrack<LocalVideoTrack | RemoteVideoTrack>[] = [];
  let index = 0;
  for (const participant of room.remoteParticipants.values()) {
    index += 1;
    const screen = participant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
    const camera = participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (screen) tracks.push({ label: `peer${index} экран`, track: screen });
    if (camera) tracks.push({ label: `peer${index} камера`, track: camera });
  }
  return tracks;
}

function captureSettings(track: LocalVideoTrack | undefined): string {
  const mediaStreamTrack = track?.mediaStreamTrack;
  if (!mediaStreamTrack) return '—';
  const settings = mediaStreamTrack.getSettings();
  if (!settings.width || !settings.height) return '—';
  return `${settings.width}×${settings.height} @${Math.round(settings.frameRate ?? 0)}`;
}

function captureCapability(track: LocalVideoTrack | undefined): string {
  const mediaStreamTrack = track?.mediaStreamTrack;
  if (!mediaStreamTrack || typeof mediaStreamTrack.getCapabilities !== 'function') return '—';
  const capabilities = mediaStreamTrack.getCapabilities();
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

  const publishers = localVideoTracks();
  const snapshot: CallStatsSnapshot = {
    captureLabel: publishers[0]?.label ?? '—',
    captureWidth: 0,
    captureHeight: 0,
    captureFps: 0,
    captureTrack: captureSettings(publishers[0]?.track),
    captureMax: captureCapability(publishers[0]?.track),
    codec: '—',
    outbound: [],
    inbound: [],
    transport: null,
  };

  for (const publisher of publishers) {
    const report = await publisher.track.getRTCStatsReport();
    if (!report) continue;
    const entries = entriesOf(report);
    if (!snapshot.transport) snapshot.transport = readTransport(entries);

    const isPrimary = publisher === publishers[0];
    const source = entries.find((entry) => entry.type === 'media-source' && entry.kind === 'video');
    if (source && isPrimary) {
      snapshot.captureWidth = source.width ?? 0;
      snapshot.captureHeight = source.height ?? 0;
      snapshot.captureFps = Math.round(source.framesPerSecond ?? 0);
    }

    for (const entry of entries) {
      if (entry.type !== 'outbound-rtp' || entry.kind !== 'video') continue;
      if (isPrimary) snapshot.codec = codecOf(entries, entry.codecId);
      snapshot.outbound.push({
        layer: entry.rid ? `${publisher.label}/${entry.rid}` : publisher.label,
        width: entry.frameWidth ?? 0,
        height: entry.frameHeight ?? 0,
        fps: Math.round(entry.framesPerSecond ?? 0),
        kbps: kbpsFor(`out:${entry.id}`, entry.bytesSent ?? 0, entry.timestamp),
        qp: averageQpFor(`out:${entry.id}`, entry.qpSum ?? 0, entry.framesEncoded ?? 0),
        limitation: entry.qualityLimitationReason ?? '—',
        encoder: entry.encoderImplementation ?? '—',
      });
    }
  }

  if (!snapshot.transport) {
    const audioReport = await localAudioReport();
    if (audioReport) snapshot.transport = readTransport(entriesOf(audioReport));
  }

  for (const subscription of remoteVideoTracks()) {
    const report = await subscription.track.getRTCStatsReport();
    if (!report) continue;
    const entries = entriesOf(report);
    if (!snapshot.transport) snapshot.transport = readTransport(entries);
    for (const entry of entries) {
      if (entry.type !== 'inbound-rtp' || entry.kind !== 'video') continue;
      snapshot.inbound.push({
        label: subscription.label,
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

export function formatCallStats(snapshot: CallStatsSnapshot): string {
  const lines: string[] = [
    `захват ${snapshot.captureLabel}: ${snapshot.captureWidth}×${snapshot.captureHeight} @${snapshot.captureFps}`,
    `трек: ${snapshot.captureTrack}`,
    `максимум: ${snapshot.captureMax}`,
    `кодек: ${snapshot.codec}`,
  ];

  const transport = snapshot.transport;
  if (transport) {
    lines.push(
      `сеть: ${transport.protocol} ${transport.localCandidate}→${transport.remoteCandidate}, rtt ${transport.rttMs} мс, полоса ${transport.availableOutgoingKbps} кбит/с`,
    );
  }

  for (const layer of snapshot.outbound) {
    lines.push(
      `отдача ${layer.layer}: ${layer.width}×${layer.height} ${layer.fps}fps ${layer.kbps}k qp${layer.qp} ${layer.limitation} [${layer.encoder}]`,
    );
  }

  for (const stream of snapshot.inbound) {
    lines.push(
      `приём ${stream.label}: ${stream.width}×${stream.height} ${stream.fps}fps ${stream.kbps}k потерь ${stream.packetsLost} фризов ${stream.freezes}`,
    );
  }

  return lines.join('\n');
}
