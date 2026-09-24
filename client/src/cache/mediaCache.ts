import { buildFileSrc, getFileToken } from '../api/files';
import {
  buildRetentionResolver,
  openCacheDb,
  requestPersistentStorage,
  type CacheDb,
  type CachedMediaMeta,
  type MediaKind,
  type MediaTier,
} from './db';

const GIGABYTE = 1024 ** 3;
const MEGABYTE = 1024 ** 2;
const HOUR = 60 * 60 * 1000;
const EVICTION_TARGET_RATIO = 0.75;
const AVATAR_RESERVE_RATIO = 0.1;

const TIER_EVICTION_ORDER: Record<MediaTier, number> = { full: 0, thumb: 1, avatar: 2 };

export const MEDIA_ACCESS_THROTTLE_MS = 24 * 60 * 60 * 1000;
export const MEDIA_EVICT_STEP_BYTES = 32 * MEGABYTE;
export const CLEANUP_INTERVAL_MS = 2 * HOUR;

function isDesktopShell(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
}

export const MEDIA_BUDGET_BYTES = isDesktopShell() ? 4 * GIGABYTE : 400 * MEGABYTE;

export interface MediaDescriptor {
  tier: MediaTier;
  chatId: string | null;
  kind: MediaKind;
}

export interface EvictionCandidate {
  fileId: string;
  chatId: string | null;
  size: number;
  lastUsedAt: number;
  tier: MediaTier;
}

export function selectEvictionVictims(candidates: EvictionCandidate[], budgetBytes: number): string[] {
  let total = candidates.reduce((sum, entry) => sum + entry.size, 0);
  if (total <= budgetBytes) return [];

  const target = budgetBytes * EVICTION_TARGET_RATIO;
  const avatarReserve = budgetBytes * AVATAR_RESERVE_RATIO;
  let avatarBytes = candidates.reduce((sum, entry) => (entry.tier === 'avatar' ? sum + entry.size : sum), 0);

  const ordered = [...candidates].sort((a, b) => {
    if (a.tier !== b.tier) return TIER_EVICTION_ORDER[a.tier] - TIER_EVICTION_ORDER[b.tier];
    return a.lastUsedAt - b.lastUsedAt;
  });

  const victims: string[] = [];
  for (const entry of ordered) {
    if (total <= target) break;
    if (entry.tier === 'avatar') {
      if (avatarBytes - entry.size < avatarReserve) continue;
      avatarBytes -= entry.size;
    }
    victims.push(entry.fileId);
    total -= entry.size;
  }
  return victims;
}

async function collectEvictionCandidates(db: CacheDb): Promise<EvictionCandidate[]> {
  const candidates: EvictionCandidate[] = [];
  let cursor = await db.transaction('mediaMeta').store.index('byLastUsed').openCursor();

  while (cursor) {
    const { fileId, chatId, size, lastUsedAt, tier } = cursor.value;
    candidates.push({ fileId, chatId, size, lastUsedAt, tier });
    cursor = await cursor.continue();
  }
  return candidates;
}

export function selectExpired(
  entries: Pick<EvictionCandidate, 'fileId' | 'chatId' | 'lastUsedAt'>[],
  now: number,
  resolveTtl: (chatId: string | null) => number,
): string[] {
  const victims: string[] = [];
  for (const entry of entries) {
    const ttl = resolveTtl(entry.chatId);
    if (ttl === Infinity) continue;
    if (now - entry.lastUsedAt > ttl) victims.push(entry.fileId);
  }
  return victims;
}

async function dropMedia(db: CacheDb, fileIds: string[]): Promise<void> {
  const tx = db.transaction(['media', 'mediaMeta'], 'readwrite');
  const media = tx.objectStore('media');
  const meta = tx.objectStore('mediaMeta');
  await Promise.all(fileIds.flatMap((fileId) => [media.delete(fileId), meta.delete(fileId)]));
  await tx.done;
}

export async function evictToBudget(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    const candidates = await collectEvictionCandidates(db);
    const resolveTtl = await buildRetentionResolver(db);
    const expired = selectExpired(candidates, Date.now(), resolveTtl);
    if (expired.length > 0) await dropMedia(db, expired);

    const expiredIds = new Set(expired);
    const remaining = candidates.filter((entry) => !expiredIds.has(entry.fileId));
    const victims = selectEvictionVictims(remaining, MEDIA_BUDGET_BYTES);
    if (victims.length === 0) return;
    await dropMedia(db, victims);
  } catch {
    return;
  }
}

let bytesSinceEviction = 0;

function noteWrittenBytes(size: number): void {
  bytesSinceEviction += size;
  if (bytesSinceEviction < MEDIA_EVICT_STEP_BYTES) return;

  bytesSinceEviction = 0;
  void evictToBudget();
}

async function touchMediaMeta(db: CacheDb, fileId: string, descriptor: MediaDescriptor, size: number): Promise<void> {
  try {
    const now = Date.now();
    const stored = await db.get('mediaMeta', fileId);
    if (stored && now - stored.lastUsedAt <= MEDIA_ACCESS_THROTTLE_MS) return;

    const next: CachedMediaMeta = stored
      ? { ...stored, lastUsedAt: now }
      : { fileId, chatId: descriptor.chatId, kind: descriptor.kind, tier: descriptor.tier, size, lastUsedAt: now };
    await db.put('mediaMeta', next);
  } catch {
    return;
  }
}

async function readFromCache(fileId: string, descriptor: MediaDescriptor): Promise<Blob | null> {
  const db = await openCacheDb();
  if (!db) return null;

  try {
    const entry = await db.get('media', fileId);
    if (!entry) return null;

    void touchMediaMeta(db, fileId, descriptor, entry.size);
    return entry.blob;
  } catch {
    return null;
  }
}

async function putMedia(db: CacheDb, fileId: string, descriptor: MediaDescriptor, blob: Blob): Promise<void> {
  const lastUsedAt = Date.now();
  const tx = db.transaction(['media', 'mediaMeta'], 'readwrite');
  await Promise.all([
    tx.objectStore('media').put({ fileId, tier: descriptor.tier, blob, size: blob.size, lastUsedAt }),
    tx.objectStore('mediaMeta').put({
      fileId,
      chatId: descriptor.chatId,
      kind: descriptor.kind,
      tier: descriptor.tier,
      size: blob.size,
      lastUsedAt,
    }),
  ]);
  await tx.done;
}

async function writeToCache(fileId: string, descriptor: MediaDescriptor, blob: Blob): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    await putMedia(db, fileId, descriptor, blob);
  } catch {
    await evictToBudget();
    await putMedia(db, fileId, descriptor, blob).catch(() => undefined);
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

const downloadAbortControllers = new Map<string, AbortController>();

export function cancelMediaDownload(fileId: string): void {
  downloadAbortControllers.get(fileId)?.abort();
  downloadAbortControllers.delete(fileId);
}

async function download(fileId: string): Promise<Blob | null> {
  const controller = new AbortController();
  downloadAbortControllers.set(fileId, controller);

  try {
    const token = await getFileToken(fileId);
    const res = await fetch(buildFileSrc(fileId, token), { signal: controller.signal });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  } finally {
    downloadAbortControllers.delete(fileId);
  }
}

async function loadMedia(fileId: string, descriptor: MediaDescriptor): Promise<Blob | null> {
  const cached = await readFromCache(fileId, descriptor);
  if (cached) return cached;

  const blob = await withDownloadSlot(() => download(fileId));
  if (!blob) return null;

  await writeToCache(fileId, descriptor, blob);
  noteWrittenBytes(blob.size);
  return blob;
}

const inflight = new Map<string, Promise<Blob | null>>();

export function resolveMedia(fileId: string, descriptor: MediaDescriptor): Promise<Blob | null> {
  const pending = inflight.get(fileId);
  if (pending) return pending;

  const task = loadMedia(fileId, descriptor).finally(() => inflight.delete(fileId));
  inflight.set(fileId, task);
  return task;
}

export interface SentMediaEntry {
  fileId: string;
  descriptor: MediaDescriptor;
  blob: Blob;
}

export async function storeSentMedia(entries: SentMediaEntry[]): Promise<void> {
  for (const entry of entries) {
    if (inflight.has(entry.fileId)) continue;
    await writeToCache(entry.fileId, entry.descriptor, entry.blob);
    noteWrittenBytes(entry.blob.size);
  }
}

export async function hasCachedMedia(fileId: string): Promise<boolean> {
  const db = await openCacheDb();
  if (!db) return false;

  try {
    return (await db.get('mediaMeta', fileId)) !== undefined;
  } catch {
    return false;
  }
}

export function startCacheMaintenance(): void {
  void requestPersistentStorage();
  void evictToBudget();
}

export async function removeCachedMediaByFileIds(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const db = await openCacheDb();
  if (!db) return;

  await dropMedia(db, fileIds).catch(() => undefined);
}
