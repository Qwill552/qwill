import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache, openCacheDb } from './db';

describe('cache db', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('открывает базу со всеми пятью хранилищами', async () => {
    const db = await openCacheDb();

    expect(db).not.toBeNull();
    expect([...db!.objectStoreNames].sort()).toEqual(['chats', 'media', 'messages', 'outbox', 'syncCursors']);
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

  it('clearAllCache опустошает хранилища', async () => {
    const db = await openCacheDb();
    await db!.put('chats', { id: 'c1' } as never);

    await clearAllCache();

    expect(await db!.count('chats')).toBe(0);
  });
});
