import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';

export type MediaTier = 'avatar' | 'thumb' | 'full';

export type MediaKind = 'photo' | 'video' | 'file' | 'voice' | 'audio' | 'avatar' | 'other';

export interface CachedMedia {
  fileId: string;
  tier: MediaTier;
  blob: Blob;
  size: number;
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
  atTail: boolean;
  savedAt: number;
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
  media: { key: string; value: CachedMedia; indexes: { byLastUsed: number } };
  mediaMeta: {
    key: string;
    value: CachedMediaMeta;
    indexes: { byLastUsed: number; byChat: string; byKind: string };
  };
  outbox: { key: string; value: OutboxEntry; indexes: { byCreatedAt: number } };
}

export type CacheDb = IDBPDatabase<CacheSchema>;

type UpgradeTransaction = IDBPTransaction<CacheSchema, StoreNames<CacheSchema>[], 'versionchange'>;

const DB_NAME = 'qwill-cache';
const DB_VERSION = 3;

const STORE_NAMES: StoreNames<CacheSchema>[] = [
  'chats',
  'messages',
  'syncCursors',
  'chatPositions',
  'media',
  'mediaMeta',
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

export async function clearAllCache(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
