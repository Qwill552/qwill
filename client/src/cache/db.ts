import type { ChatListItemDto, ChatType, MessageDto } from '@messenger/shared';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';

export type MediaTier = 'avatar' | 'thumb' | 'full';

export type MediaKind = 'photo' | 'video' | 'file' | 'voice' | 'audio' | 'avatar' | 'other';

export type RetentionPeriod = '3d' | '1w' | '1m' | 'forever';

export interface RetentionSettings {
  keepMediaPrivate: RetentionPeriod;
  keepMediaGroups: RetentionPeriod;
  keepMediaExceptions: Record<string, RetentionPeriod>;
}

const DEFAULT_RETENTION_SETTINGS: RetentionSettings = {
  keepMediaPrivate: '1w',
  keepMediaGroups: '1w',
  keepMediaExceptions: {},
};

interface SettingEntry {
  key: string;
  value: unknown;
}

export interface CachedMedia {
  fileId: string;
  tier: MediaTier;
  blob: Blob;
  size: number;
  lastUsedAt: number;
}

export interface CachedVideoChunk {
  key: string;
  fileId: string;
  index: number;
  chatId: string | null;
  size: number;
  totalSize: number;
  lastUsedAt: number;
}

export interface CachedMediaMeta {
  fileId: string;
  chatId: string | null;
  kind: MediaKind;
  tier: MediaTier;
  size: number;
  lastUsedAt: number;
}

export interface CachedChatPosition {
  chatId: string;
  fromId: number | null;
  toId: number | null;
  anchorId: number | null;
  anchorOffset: number;
  atTail: boolean;
  runId: string;
  savedAt: number;
}

export interface MessageRange {
  fromId: number;
  toId: number;
}

export interface CachedMessageRanges {
  chatId: string;
  ranges: MessageRange[];
}

export interface SyncCursor {
  chatId: string;
  maxId: number;
  maxUpdatedAt: string | null;
}

export interface OutboxAttachment {
  blob: Blob;
  fileName: string;
  mimeType: string;
  duration: number | null;
  peaks: number[] | null;
}

export interface OutboxEntry {
  clientId: string;
  chatId: string;
  albumId?: string | null;
  content: string | null;
  replyToId: number | null;
  attachment: OutboxAttachment | null;
  createdAt: number;
  attempts: number;
}

interface CacheSchema extends DBSchema {
  chats: { key: string; value: ChatListItemDto };
  messages: { key: [string, number]; value: MessageDto; indexes: { byChat: string } };
  syncCursors: { key: string; value: SyncCursor };
  chatPositions: { key: string; value: CachedChatPosition; indexes: { bySavedAt: number } };
  messageRanges: { key: string; value: CachedMessageRanges };
  media: { key: string; value: CachedMedia; indexes: { byLastUsed: number } };
  mediaMeta: {
    key: string;
    value: CachedMediaMeta;
    indexes: { byLastUsed: number; byChat: string; byKind: string };
  };
  videoChunks: {
    key: string;
    value: CachedVideoChunk;
    indexes: { byLastUsed: number; byFile: string };
  };
  outbox: { key: string; value: OutboxEntry; indexes: { byCreatedAt: number } };
  settings: { key: string; value: SettingEntry };
}

export type CacheDb = IDBPDatabase<CacheSchema>;

type UpgradeTransaction = IDBPTransaction<CacheSchema, StoreNames<CacheSchema>[], 'versionchange'>;

const DB_NAME = 'qwill-cache';
export const VIDEO_CACHE_NAME = 'qwill-video';
const DB_VERSION = 6;

const STORE_NAMES: StoreNames<CacheSchema>[] = [
  'chats',
  'messages',
  'syncCursors',
  'chatPositions',
  'messageRanges',
  'media',
  'mediaMeta',
  'videoChunks',
  'outbox',
];

let dbPromise: Promise<CacheDb | null> | null = null;

async function backfillMediaMeta(tx: UpgradeTransaction): Promise<void> {
  const meta = tx.objectStore('mediaMeta');
  let cursor = await tx.objectStore('media').openCursor();

  while (cursor) {
    const { fileId, tier, size, lastUsedAt } = cursor.value;
    await meta.put({ fileId, chatId: null, kind: 'other', tier, size, lastUsedAt });
    cursor = await cursor.continue();
  }
}

export function openCacheDb(): Promise<CacheDb | null> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<CacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('chats', { keyPath: 'id' });
        db.createObjectStore('messages', { keyPath: ['chatId', 'id'] }).createIndex('byChat', 'chatId');
        db.createObjectStore('syncCursors', { keyPath: 'chatId' });
        db.createObjectStore('media', { keyPath: 'fileId' }).createIndex('byLastUsed', 'lastUsedAt');
        db.createObjectStore('outbox', { keyPath: 'clientId' }).createIndex('byCreatedAt', 'createdAt');
      }

      if (oldVersion < 2) {
        const meta = db.createObjectStore('mediaMeta', { keyPath: 'fileId' });
        meta.createIndex('byLastUsed', 'lastUsedAt');
        meta.createIndex('byChat', 'chatId');
        meta.createIndex('byKind', 'kind');
        void backfillMediaMeta(tx).catch(() => undefined);
      }

      if (oldVersion < 3) {
        db.createObjectStore('chatPositions', { keyPath: 'chatId' }).createIndex('bySavedAt', 'savedAt');
      }

      if (oldVersion < 4) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (oldVersion < 5) {
        const chunks = db.createObjectStore('videoChunks', { keyPath: 'key' });
        chunks.createIndex('byLastUsed', 'lastUsedAt');
        chunks.createIndex('byFile', 'fileId');
      }

      if (oldVersion < 6) {
        db.createObjectStore('messageRanges', { keyPath: 'chatId' });
      }
    },
  }).catch(() => null);

  return dbPromise;
}

let storagePersisted: boolean | null = null;

export function isStoragePersisted(): boolean | null {
  return storagePersisted;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return false;

    storagePersisted = (await storage.persisted?.()) || (await storage.persist());
    return storagePersisted;
  } catch {
    storagePersisted = false;
    return false;
  }
}

async function deleteVideoCacheStorage(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    await caches.delete(VIDEO_CACHE_NAME);
  } catch {
    return;
  }
}

export async function clearAllCache(): Promise<void> {
  await deleteVideoCacheStorage();

  const db = await openCacheDb();
  if (!db) return;

  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}

export async function readRetentionSettings(): Promise<RetentionSettings> {
  const db = await openCacheDb();
  if (!db) return DEFAULT_RETENTION_SETTINGS;

  try {
    const [privateEntry, groupsEntry, exceptionsEntry] = await Promise.all([
      db.get('settings', 'keepMediaPrivate'),
      db.get('settings', 'keepMediaGroups'),
      db.get('settings', 'keepMediaExceptions'),
    ]);

    return {
      keepMediaPrivate: (privateEntry?.value as RetentionPeriod) ?? DEFAULT_RETENTION_SETTINGS.keepMediaPrivate,
      keepMediaGroups: (groupsEntry?.value as RetentionPeriod) ?? DEFAULT_RETENTION_SETTINGS.keepMediaGroups,
      keepMediaExceptions:
        (exceptionsEntry?.value as Record<string, RetentionPeriod>) ?? DEFAULT_RETENTION_SETTINGS.keepMediaExceptions,
    };
  } catch {
    return DEFAULT_RETENTION_SETTINGS;
  }
}

export async function writeRetentionSetting<K extends keyof RetentionSettings>(
  key: K,
  value: RetentionSettings[K],
): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    await db.put('settings', { key, value });
  } catch {
    return;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const RETENTION_MS: Record<RetentionPeriod, number> = {
  '3d': 3 * DAY_MS,
  '1w': 7 * DAY_MS,
  '1m': 30 * DAY_MS,
  forever: Infinity,
};

export async function buildRetentionResolver(db: CacheDb): Promise<(chatId: string | null) => number> {
  const settings = await readRetentionSettings();
  const chatTypeById = new Map<string, ChatType>();
  try {
    for (const chat of await db.getAll('chats')) chatTypeById.set(chat.id, chat.type);
  } catch {
    return () => Infinity;
  }

  return (chatId: string | null): number => {
    if (chatId === null) return Infinity;

    const exception = settings.keepMediaExceptions[chatId];
    const period = exception ?? (chatTypeById.get(chatId) === 'GROUP' ? settings.keepMediaGroups : settings.keepMediaPrivate);
    return RETENTION_MS[period];
  };
}
