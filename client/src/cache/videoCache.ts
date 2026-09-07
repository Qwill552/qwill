import { buildRetentionResolver, openCacheDb, VIDEO_CACHE_NAME, type CacheDb, type CachedVideoChunk } from './db';

const MEGABYTE = 1024 ** 2;
const GIGABYTE = 1024 ** 3;

export const VIDEO_STREAM_PREFIX = '/media/';
export const VIDEO_CHUNK_BYTES = 512 * 1024;
export const VIDEO_SERVE_MAX_BYTES = 2 * VIDEO_CHUNK_BYTES;
export const VIDEO_EVICT_STEP_BYTES = 32 * MEGABYTE;
export const VIDEO_ACCESS_THROTTLE_MS = 24 * 60 * 60 * 1000;

export const VIDEO_SOURCE_MESSAGE = 'video-source';
export const VIDEO_SOURCE_REQUEST_MESSAGE = 'video-source-request';

const EVICTION_TARGET_RATIO = 0.75;
const CHUNK_KEY_PREFIX = '/__video/';

function isDesktopShell(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
}

export const VIDEO_CACHE_BUDGET_BYTES = isDesktopShell() ? 2 * GIGABYTE : 200 * MEGABYTE;

export interface ByteRange {
  start: number;
  end: number;
}

export interface VideoInfo {
  totalSize: number;
  mimeType: string;
}

export function streamUrl(fileId: string, chatId: string | null): string {
  const base = `${VIDEO_STREAM_PREFIX}${encodeURIComponent(fileId)}`;
  return chatId ? `${base}?chat=${encodeURIComponent(chatId)}` : base;
}

export function parseStreamUrl(pathname: string, search: string): { fileId: string; chatId: string | null } | null {
  if (!pathname.startsWith(VIDEO_STREAM_PREFIX)) return null;
  const raw = pathname.slice(VIDEO_STREAM_PREFIX.length);
  if (raw === '' || raw.includes('/')) return null;

  let fileId: string;
  try {
    fileId = decodeURIComponent(raw);
  } catch {
    return null;
  }

  const chat = new URLSearchParams(search).get('chat');
  return { fileId, chatId: chat === null || chat === '' ? null : chat };
}

export function parseRangeHeader(header: string | null | undefined, totalSize: number): ByteRange | null {
  if (totalSize <= 0) return null;
  if (!header) return { start: 0, end: totalSize - 1 };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';
  if (rawStart === '' && rawEnd === '') return null;

  if (rawStart === '') {
    const suffix = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, totalSize - suffix), end: totalSize - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  if (!Number.isFinite(start) || start >= totalSize) return null;

  const end = rawEnd === '' ? totalSize - 1 : Math.min(Number.parseInt(rawEnd, 10), totalSize - 1);
  if (!Number.isFinite(end) || end < start) return null;

  return { start, end };
}

export function parseRangeStart(header: string | null | undefined): number | null {
  if (!header) return 0;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  const rawStart = match?.[1] ?? '';
  if (rawStart === '') return null;
  const start = Number.parseInt(rawStart, 10);
  return Number.isFinite(start) ? start : null;
}

export function parseContentRangeTotal(header: string | null | undefined): number | null {
  const match = /\/(\d+)$/.exec((header ?? '').trim());
  if (!match) return null;
  const total = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function planServedRange(
  requested: ByteRange,
  totalSize: number,
  chunkBytes: number = VIDEO_CHUNK_BYTES,
  maxBytes: number = VIDEO_SERVE_MAX_BYTES,
): ByteRange {
  const hardEnd = Math.min(requested.end, totalSize - 1);
  const windowEnd = requested.start + maxBytes - 1;
  if (hardEnd <= windowEnd) return { start: requested.start, end: hardEnd };

  const boundary = (Math.floor(windowEnd / chunkBytes) + 1) * chunkBytes - 1;
  return { start: requested.start, end: Math.min(hardEnd, boundary) };
}

export function chunkIndexesFor(range: ByteRange, chunkBytes: number = VIDEO_CHUNK_BYTES): number[] {
  const first = Math.floor(range.start / chunkBytes);
  const last = Math.floor(range.end / chunkBytes);
  const indexes: number[] = [];
  for (let index = first; index <= last; index += 1) indexes.push(index);
  return indexes;
}

export function chunkRange(index: number, totalSize: number, chunkBytes: number = VIDEO_CHUNK_BYTES): ByteRange {
  const start = index * chunkBytes;
  return { start, end: Math.min(start + chunkBytes - 1, totalSize - 1) };
}

export interface ChunkPart {
  index: number;
  bytes: ArrayBuffer;
}

export function assembleRange(parts: ChunkPart[], range: ByteRange, chunkBytes: number = VIDEO_CHUNK_BYTES): Uint8Array {
  const out = new Uint8Array(range.end - range.start + 1);

  for (const part of parts) {
    const source = new Uint8Array(part.bytes);
    const chunkStart = part.index * chunkBytes;
    const from = Math.max(range.start, chunkStart);
    const to = Math.min(range.end, chunkStart + source.length - 1);
    if (to < from) continue;
    out.set(source.subarray(from - chunkStart, to - chunkStart + 1), from - range.start);
  }

  return out;
}

export function contentRangeHeader(range: ByteRange, totalSize: number): string {
  return `bytes ${range.start}-${range.end}/${totalSize}`;
}

export interface VideoChunkEntry {
  key: string;
  chatId: string | null;
  size: number;
  lastUsedAt: number;
}

export function selectVideoVictims(entries: VideoChunkEntry[], budgetBytes: number): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total <= budgetBytes) return [];

  const target = budgetBytes * EVICTION_TARGET_RATIO;
  const ordered = [...entries].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const victims: string[] = [];

  for (const entry of ordered) {
    if (total <= target) break;
    victims.push(entry.key);
    total -= entry.size;
  }

  return victims;
}

export function selectExpiredVideoChunks(
  entries: VideoChunkEntry[],
  now: number,
  resolveTtl: (chatId: string | null) => number,
): string[] {
  const victims: string[] = [];

  for (const entry of entries) {
    const ttl = resolveTtl(entry.chatId);
    if (ttl === Infinity) continue;
    if (now - entry.lastUsedAt > ttl) victims.push(entry.key);
  }

  return victims;
}

function chunkKey(fileId: string, index: number): string {
  return `${CHUNK_KEY_PREFIX}${encodeURIComponent(fileId)}/${index}`;
}

function infoKey(fileId: string): string {
  return `${CHUNK_KEY_PREFIX}${encodeURIComponent(fileId)}/info`;
}

function cacheStorage(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

async function openVideoCache(): Promise<Cache | null> {
  const storage = cacheStorage();
  if (!storage) return null;

  try {
    return await storage.open(VIDEO_CACHE_NAME);
  } catch {
    return null;
  }
}

export async function readVideoInfo(fileId: string): Promise<VideoInfo | null> {
  const cache = await openVideoCache();
  if (!cache) return null;

  try {
    const response = await cache.match(infoKey(fileId));
    if (!response) return null;

    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return null;

    const { totalSize, mimeType } = data as Partial<VideoInfo>;
    if (typeof totalSize !== 'number' || totalSize <= 0) return null;
    return { totalSize, mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'video/mp4' };
  } catch {
    return null;
  }
}

export async function writeVideoInfo(fileId: string, info: VideoInfo): Promise<void> {
  const cache = await openVideoCache();
  if (!cache) return;

  try {
    await cache.put(
      infoKey(fileId),
      new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch {
    return;
  }
}

async function touchChunk(fileId: string, index: number): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    const key = chunkKey(fileId, index);
    const stored = await db.get('videoChunks', key);
    const now = Date.now();
    if (!stored || now - stored.lastUsedAt <= VIDEO_ACCESS_THROTTLE_MS) return;
    await db.put('videoChunks', { ...stored, lastUsedAt: now });
  } catch {
    return;
  }
}

export async function readCachedChunk(fileId: string, index: number): Promise<ArrayBuffer | null> {
  const cache = await openVideoCache();
  if (!cache) return null;

  try {
    const response = await cache.match(chunkKey(fileId, index));
    if (!response) return null;

    void touchChunk(fileId, index);
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

let bytesSinceEviction = 0;

function noteWrittenBytes(size: number): void {
  bytesSinceEviction += size;
  if (bytesSinceEviction < VIDEO_EVICT_STEP_BYTES) return;

  bytesSinceEviction = 0;
  void evictVideoCache();
}

async function writeChunkMeta(meta: CachedVideoChunk): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    await db.put('videoChunks', meta);
  } catch {
    return;
  }
}

export async function writeCachedChunk(
  fileId: string,
  index: number,
  descriptor: { chatId: string | null; totalSize: number },
  bytes: ArrayBuffer,
): Promise<void> {
  const cache = await openVideoCache();
  if (!cache) return;

  const key = chunkKey(fileId, index);
  try {
    await cache.put(key, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  } catch {
    return;
  }

  const meta: CachedVideoChunk = {
    key,
    fileId,
    index,
    chatId: descriptor.chatId,
    size: bytes.byteLength,
    totalSize: descriptor.totalSize,
    lastUsedAt: Date.now(),
  };

  void writeChunkMeta(meta);
  noteWrittenBytes(bytes.byteLength);
}

async function dropChunks(db: CacheDb, cache: Cache, keys: string[], all: CachedVideoChunk[]): Promise<void> {
  if (keys.length === 0) return;

  const dropped = new Set(keys);
  await Promise.all(keys.map((key) => cache.delete(key)));

  const tx = db.transaction('videoChunks', 'readwrite');
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;

  const survivingFiles = new Set(all.filter((entry) => !dropped.has(entry.key)).map((entry) => entry.fileId));
  const emptyFiles = new Set(
    all.filter((entry) => dropped.has(entry.key) && !survivingFiles.has(entry.fileId)).map((entry) => entry.fileId),
  );
  await Promise.all([...emptyFiles].map((fileId) => cache.delete(infoKey(fileId))));
}

export async function evictVideoCache(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  const cache = await openVideoCache();
  if (!cache) return;

  try {
    const entries = await db.getAll('videoChunks');
    if (entries.length === 0) return;

    const resolveTtl = await buildRetentionResolver(db);
    const expired = selectExpiredVideoChunks(entries, Date.now(), resolveTtl);
    const expiredKeys = new Set(expired);
    const remaining = entries.filter((entry) => !expiredKeys.has(entry.key));
    const victims = [...expired, ...selectVideoVictims(remaining, VIDEO_CACHE_BUDGET_BYTES)];

    await dropChunks(db, cache, victims, entries);
  } catch {
    return;
  }
}

export interface VideoUsage {
  total: number;
  byChat: Map<string | null, number>;
}

export async function collectVideoUsage(): Promise<VideoUsage> {
  const usage: VideoUsage = { total: 0, byChat: new Map() };

  const db = await openCacheDb();
  if (!db) return usage;

  try {
    for (const entry of await db.getAll('videoChunks')) {
      usage.total += entry.size;
      usage.byChat.set(entry.chatId, (usage.byChat.get(entry.chatId) ?? 0) + entry.size);
    }
  } catch {
    return { total: 0, byChat: new Map() };
  }

  return usage;
}

export async function removeVideoChunksForChats(chatIds: (string | null)[]): Promise<void> {
  if (chatIds.length === 0) return;

  const db = await openCacheDb();
  if (!db) return;
  const cache = await openVideoCache();
  if (!cache) return;

  try {
    const entries = await db.getAll('videoChunks');
    const victims = entries.filter((entry) => chatIds.includes(entry.chatId)).map((entry) => entry.key);
    await dropChunks(db, cache, victims, entries);
  } catch {
    return;
  }
}

export async function clearAllVideoChunks(): Promise<void> {
  const storage = cacheStorage();
  try {
    await storage?.delete(VIDEO_CACHE_NAME);
  } catch {
    return;
  }

  const db = await openCacheDb();
  if (!db) return;

  try {
    await db.clear('videoChunks');
  } catch {
    return;
  }
}
