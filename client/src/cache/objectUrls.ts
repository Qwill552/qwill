import type { MediaTier } from './db';
import { resolveMedia } from './mediaCache';

const IDLE_LIMIT = 48;

interface UrlEntry {
  url: string;
  refs: number;
}

const live = new Map<string, UrlEntry>();
const idle: string[] = [];
let sweepTimer: ReturnType<typeof setTimeout> | null = null;

function sweep(): void {
  sweepTimer = null;
  while (idle.length > IDLE_LIMIT) {
    const fileId = idle.shift();
    if (!fileId) return;
    const entry = live.get(fileId);
    if (!entry || entry.refs > 0) continue;
    URL.revokeObjectURL(entry.url);
    live.delete(fileId);
  }
}

export function peekObjectUrl(fileId: string): string | undefined {
  return live.get(fileId)?.url;
}

export function retainObjectUrl(fileId: string): string | null {
  const entry = live.get(fileId);
  if (!entry) return null;
  if (entry.refs === 0) {
    const at = idle.indexOf(fileId);
    if (at >= 0) idle.splice(at, 1);
  }
  entry.refs += 1;
  return entry.url;
}

export async function acquireObjectUrl(fileId: string, tier: MediaTier): Promise<string | null> {
  const ready = retainObjectUrl(fileId);
  if (ready) return ready;

  const blob = await resolveMedia(fileId, tier);
  if (!blob) return null;

  const raced = retainObjectUrl(fileId);
  if (raced) return raced;

  const entry: UrlEntry = { url: URL.createObjectURL(blob), refs: 1 };
  live.set(fileId, entry);
  return entry.url;
}

export function releaseObjectUrl(fileId: string): void {
  const entry = live.get(fileId);
  if (!entry || entry.refs === 0) return;

  entry.refs -= 1;
  if (entry.refs > 0) return;

  idle.push(fileId);
  if (sweepTimer === null) sweepTimer = setTimeout(sweep, 0);
}
