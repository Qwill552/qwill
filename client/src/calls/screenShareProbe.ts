import { collectCallStats, type CallStatsSnapshot } from './callStats';
import { traceCall } from './callTrace';
import type { ScreenShareChangeMode } from './types';

const PROBE_DELAYS_MS = [2000, 5000, 10000];

const MODE_LABEL: Record<ScreenShareChangeMode, string> = {
  replace: 'подмена трека',
  republish: 'гашение прежнего захвата',
};

let changeCount = 0;

function outboundLine(snapshot: CallStatsSnapshot): string {
  const screen = snapshot.outbound.find((layer) => layer.layer.startsWith('экран'));
  if (!screen) return 'отдача —';
  return `отдача ${screen.width}×${screen.height} ${screen.fps}fps ${screen.kbps}k qp${screen.qp} ${screen.limitation} [${screen.encoder}]`;
}

function inboundLine(snapshot: CallStatsSnapshot): string {
  const screens = snapshot.inbound.filter((stream) => stream.label.endsWith('экран'));
  if (screens.length === 0) return 'приём —';
  return screens
    .map((stream) => `приём ${stream.label} ${stream.width}×${stream.height} ${stream.fps}fps фризов ${stream.freezes}`)
    .join(' · ');
}

function snapshotLine(snapshot: CallStatsSnapshot): string {
  return [
    `захват ${snapshot.captureWidth}×${snapshot.captureHeight} @${snapshot.captureFps}`,
    `трек ${snapshot.captureTrack}`,
    `поверхность ${snapshot.captureSurface}`,
    outboundLine(snapshot),
    inboundLine(snapshot),
  ].join(' · ');
}

async function probe(tag: string): Promise<void> {
  const snapshot = await collectCallStats();
  if (!snapshot) return;
  traceCall(tag, snapshotLine(snapshot));
}

export function describeCaptureTrack(track: MediaStreamTrack): string {
  const settings = track.getSettings();
  const surface = settings.displaySurface ?? '?';
  return `${settings.width ?? 0}×${settings.height ?? 0} @${Math.round(settings.frameRate ?? 0)} ${surface} ${track.label || '—'}`;
}

export function resetScreenShareChangeProbe(): void {
  changeCount = 0;
}

export async function beginScreenShareChangeProbe(mode: ScreenShareChangeMode): Promise<number> {
  changeCount += 1;
  await probe(`смена источника #${changeCount} · до · ${MODE_LABEL[mode]}`);
  return changeCount;
}

export function traceScreenShareChangeStep(index: number, step: string, detail: string): void {
  traceCall(`смена источника #${index} · ${step}`, detail);
}

export function finishScreenShareChangeProbe(index: number): void {
  for (const delay of PROBE_DELAYS_MS) {
    setTimeout(() => void probe(`смена источника #${index} · +${delay / 1000}с`), delay);
  }
}
