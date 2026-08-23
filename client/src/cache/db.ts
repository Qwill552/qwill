import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type MediaTier = 'thumb' | 'full';

export interface CachedMedia {
  fileId: string;
  tier: MediaTier;
  blob: Blob;
  size: number;
  lastUsedAt: number;
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
  media: { key: string; value: CachedMedia; indexes: { byLastUsed: number } };
  outbox: { key: string; value: OutboxEntry; indexes: { byCreatedAt: number } };
}

export type CacheDb = IDBPDatabase<CacheSchema>;

const DB_NAME = 'qwill-cache';
const DB_VERSION = 1;

let dbPromise: Promise<CacheDb | null> | null = null;

export function openCacheDb(): Promise<CacheDb | null> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<CacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('chats', { keyPath: 'id' });
      db.createObjectStore('messages', { keyPath: ['chatId', 'id'] }).createIndex('byChat', 'chatId');
      db.createObjectStore('syncCursors', { keyPath: 'chatId' });
      db.createObjectStore('media', { keyPath: 'fileId' }).createIndex('byLastUsed', 'lastUsedAt');
      db.createObjectStore('outbox', { keyPath: 'clientId' }).createIndex('byCreatedAt', 'createdAt');
    },
  }).catch(() => null);

  return dbPromise;
}

export async function clearAllCache(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const tx = db.transaction(['chats', 'messages', 'syncCursors', 'media', 'outbox'], 'readwrite');
  await Promise.all([
    tx.objectStore('chats').clear(),
    tx.objectStore('messages').clear(),
    tx.objectStore('syncCursors').clear(),
    tx.objectStore('media').clear(),
    tx.objectStore('outbox').clear(),
  ]);
  await tx.done;
}
