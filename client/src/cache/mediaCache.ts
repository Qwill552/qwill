import { buildFileSrc, fetchFileToken } from '../api/files';
import { openCacheDb, type MediaTier } from './db';

const GIGABYTE = 1024 ** 3;
const MEGABYTE = 1024 ** 2;
const EVICTION_TARGET_RATIO = 0.75;

function isDesktopShell(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
}

export const MEDIA_BUDGET_BYTES = isDesktopShell() ? 4 * GIGABYTE : 400 * MEGABYTE;

export interface EvictionCandidate {
  fileId: string;
  size: number;
  lastUsedAt: number;
  tier: MediaTier;
}

export function selectEvictionVictims(candidates: EvictionCandidate[], budgetBytes: number): string[] {
  let total = candidates.reduce((sum, entry) => sum + entry.size, 0);
  if (total <= budgetBytes) return [];

  const target = budgetBytes * EVICTION_TARGET_RATIO;
  const ordered = [...candidates].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'full' ? -1 : 1;
    return a.lastUsedAt - b.lastUsedAt;
  });

  const victims: string[] = [];
  for (const entry of ordered) {
    if (total <= target) break;
    victims.push(entry.fileId);
    total -= entry.size;
  }
  return victims;
}

export async function evictToBudget(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const entries = await db.getAll('media');
  const victims = selectEvictionVictims(
    entries.map(({ fileId, size, lastUsedAt, tier }) => ({ fileId, size, lastUsedAt, tier })),
    MEDIA_BUDGET_BYTES,
  );
  if (victims.length === 0) return;

  const tx = db.transaction('media', 'readwrite');
  await Promise.all(victims.map((fileId) => tx.store.delete(fileId)));
  await tx.done;
}

async function readFromCache(fileId: string): Promise<Blob | null> {
  const db = await openCacheDb();
  if (!db) return null;

  const entry = await db.get('media', fileId);
  if (!entry) return null;

  void db.put('media', { ...entry, lastUsedAt: Date.now() }).catch(() => undefined);
  return entry.blob;
}

async function writeToCache(fileId: string, tier: MediaTier, blob: Blob): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const entry = { fileId, tier, blob, size: blob.size, lastUsedAt: Date.now() };
  try {
    await db.put('media', entry);
  } catch {
    await evictToBudget();
    await db.put('media', entry).catch(() => undefined);
  }
}

async function download(fileId: string): Promise<Blob | null> {
  try {
    const token = await fetchFileToken(fileId);
    const res = await fetch(buildFileSrc(fileId, token));
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function resolveMedia(fileId: string, tier: MediaTier): Promise<Blob | null> {
  const cached = await readFromCache(fileId);
  if (cached) return cached;

  const blob = await download(fileId);
  if (!blob) return null;

  await writeToCache(fileId, tier, blob);
  void evictToBudget();
  return blob;
}
