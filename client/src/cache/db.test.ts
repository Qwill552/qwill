import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache, openCacheDb } from './db';

describe('миграция со старой базы', () => {
  it('заводит мету для записей, попавших в кэш до второй версии', async () => {
    const old = await openDB('qwill-cache', 1, {
      upgrade(db) {
        db.createObjectStore('chats', { keyPath: 'id' });
        db.createObjectStore('messages', { keyPath: ['chatId', 'id'] }).createIndex('byChat', 'chatId');
        db.createObjectStore('syncCursors', { keyPath: 'chatId' });
        db.createObjectStore('media', { keyPath: 'fileId' }).createIndex('byLastUsed', 'lastUsedAt');
        db.createObjectStore('outbox', { keyPath: 'clientId' }).createIndex('byCreatedAt', 'createdAt');
      },
    });
    await old.put('media', { fileId: 'legacy', tier: 'thumb', blob: new Blob(['x']), size: 11, lastUsedAt: 42 });
    old.close();

    const db = await openCacheDb();
    const meta = await db!.get('mediaMeta', 'legacy');

    expect(await db!.count('media')).toBe(1);
    expect(meta).toEqual({ fileId: 'legacy', chatId: null, kind: 'other', tier: 'thumb', size: 11, lastUsedAt: 42 });
    expect(db!.objectStoreNames.contains('chatPositions')).toBe(true);
  });
});

describe('cache db', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('открывает базу со всеми хранилищами', async () => {
    const db = await openCacheDb();

    expect(db).not.toBeNull();
    expect([...db!.objectStoreNames].sort()).toEqual([
      'chatPositions',
      'chats',
      'media',
      'mediaMeta',
      'messages',
      'outbox',
      'settings',
      'syncCursors',
      'videoChunks',
    ]);
  });

  it('хранит сообщение по составному ключу чат+id', async () => {
    const db = await openCacheDb();
    await db!.put('messages', { chatId: 'c1', id: 7, content: 'привет' } as never);

    const stored = await db!.get('messages', ['c1', 7]);

    expect(stored?.content).toBe('привет');
  });

  it('отдаёт медиа по индексу времени последнего доступа', async () => {
    const db = await openCacheDb();
    await db!.put('media', { fileId: 'f1', tier: 'full', blob: new Blob(['x']), size: 1, lastUsedAt: 200 });
    await db!.put('media', { fileId: 'f2', tier: 'full', blob: new Blob(['y']), size: 1, lastUsedAt: 100 });

    const byOldest = await db!.getAllFromIndex('media', 'byLastUsed');

    expect(byOldest.map((entry) => entry.fileId)).toEqual(['f2', 'f1']);
  });

  it('отдаёт мету медиа по чату и по типу', async () => {
    const db = await openCacheDb();
    await db!.put('mediaMeta', { fileId: 'p1', chatId: 'c1', kind: 'photo', tier: 'thumb', size: 5, lastUsedAt: 1 });
    await db!.put('mediaMeta', { fileId: 'v1', chatId: 'c1', kind: 'voice', tier: 'full', size: 7, lastUsedAt: 2 });
    await db!.put('mediaMeta', { fileId: 'a1', chatId: null, kind: 'avatar', tier: 'avatar', size: 3, lastUsedAt: 3 });

    const ofChat = await db!.getAllFromIndex('mediaMeta', 'byChat', 'c1');
    const avatars = await db!.getAllFromIndex('mediaMeta', 'byKind', 'avatar');

    expect(ofChat.map((entry) => entry.fileId).sort()).toEqual(['p1', 'v1']);
    expect(avatars.map((entry) => entry.fileId)).toEqual(['a1']);
  });

  it('clearAllCache опустошает хранилища', async () => {
    const db = await openCacheDb();
    await db!.put('chats', { id: 'c1' } as never);
    await db!.put('mediaMeta', { fileId: 'p1', chatId: 'c1', kind: 'photo', tier: 'thumb', size: 5, lastUsedAt: 1 });
    await db!.put('videoChunks', {
      key: 'k1',
      fileId: 'f1',
      index: 0,
      chatId: 'c1',
      size: 10,
      totalSize: 10,
      lastUsedAt: 1,
    });

    await clearAllCache();

    expect(await db!.count('chats')).toBe(0);
    expect(await db!.count('mediaMeta')).toBe(0);
    expect(await db!.count('videoChunks')).toBe(0);
  });
});
