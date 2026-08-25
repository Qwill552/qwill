import { buildFileSrc, getFileToken } from '../api/files';
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

const MAX_PARALLEL_DOWNLOADS = 4;

let activeDownloads = 0;
const downloadQueue: (() => void)[] = [];

async function withDownloadSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeDownloads >= MAX_PARALLEL_DOWNLOADS) {
    await new Promise<void>((resolve) => downloadQueue.push(resolve));
  }
  activeDownloads += 1;
  try {
    return await task();
  } finally {
    activeDownloads -= 1;
    downloadQueue.shift()?.();
  }
}

async function download(fileId: string): Promise<Blob | null> {
  try {
    const token = await getFileToken(fileId);
    const res = await fetch(buildFileSrc(fileId, token));
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

async function loadMedia(fileId: string, tier: MediaTier): Promise<Blob | null> {
  const cached = await readFromCache(fileId);
  if (cached) return cached;

  const blob = await withDownloadSlot(() => download(fileId));
  if (!blob) return null;

  await writeToCache(fileId, tier, blob);
  void evictToBudget();
  return blob;
}

const inflight = new Map<string, Promise<Blob | null>>();

export function resolveMedia(fileId: string, tier: MediaTier): Promise<Blob | null> {
  const pending = inflight.get(fileId);
  if (pending) return pending;

  const task = loadMedia(fileId, tier).finally(() => inflight.delete(fileId));
  inflight.set(fileId, task);
  return task;
}

/** Чат удалён — его вложения выкидываются из кэша, а не ждут общего вытеснения по бюджету
 *  (R-11, repair/11-delete-chat.md). */
export async function removeCachedMediaByFileIds(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const db = await openCacheDb();
  if (!db) return;

  const tx = db.transaction('media', 'readwrite');
  await Promise.all(fileIds.map((fileId) => tx.store.delete(fileId)));
  await tx.done;
}
