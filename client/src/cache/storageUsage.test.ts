import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache, openCacheDb, type CachedMediaMeta, type MediaKind } from './db';
import {
  cellSize,
  chatCellKeys,
  chatKindCellKey,
  clearAllHistory,
  clearAllMedia,
  clearSelectedMedia,
  computeStorageUsage,
  countCachedMessages,
  kindCellKeys,
  selectionTotalBytes,
} from './storageUsage';

function meta(
  fileId: string,
  chatId: string | null,
  kind: MediaKind,
  size: number,
  overrides: Partial<CachedMediaMeta> = {},
): CachedMediaMeta {
  return { fileId, chatId, kind, tier: 'full', size, lastUsedAt: Date.now(), ...overrides };
}

async function seedMedia(entries: CachedMediaMeta[]): Promise<void> {
  const db = await openCacheDb();
  const tx = db!.transaction(['media', 'mediaMeta'], 'readwrite');
  for (const entry of entries) {
    await tx.objectStore('media').put({
      fileId: entry.fileId,
      tier: entry.tier,
      blob: new Blob([new Uint8Array(entry.size)]),
      size: entry.size,
      lastUsedAt: entry.lastUsedAt,
    });
    await tx.objectStore('mediaMeta').put(entry);
  }
  await tx.done;
}

describe('computeStorageUsage', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('складывает размер по типам и по чатам', async () => {
    await seedMedia([
      meta('p1', 'c1', 'photo', 100),
      meta('p2', 'c1', 'photo', 50),
      meta('v1', 'c2', 'video', 300),
      meta('f1', 'c1', 'file', 20),
    ]);

    const usage = await computeStorageUsage();

    expect(usage.total).toBe(470);
    expect(usage.byKind.photo).toBe(150);
    expect(usage.byKind.video).toBe(300);
    expect(usage.byKind.file).toBe(20);

    const c1 = usage.byChat.find((c) => c.chatId === 'c1')!;
    const c2 = usage.byChat.find((c) => c.chatId === 'c2')!;
    expect(c1.size).toBe(170);
    expect(c1.byKind.photo).toBe(150);
    expect(c1.byKind.file).toBe(20);
    expect(c2.size).toBe(300);

    expect(usage.byChat[0]!.chatId).toBe('c2');
  });

  it('записи без chatId попадают в общий счёт типа, но не в список чатов', async () => {
    await seedMedia([meta('old-1', null, 'other', 40), meta('ava-1', null, 'avatar', 10)]);

    const usage = await computeStorageUsage();

    expect(usage.byKind.other).toBe(40);
    expect(usage.byKind.avatar).toBe(10);
    expect(usage.byChat).toEqual([]);
  });

  it('пустой кэш — нулевая разбивка, а не ошибка', async () => {
    const usage = await computeStorageUsage();

    expect(usage.total).toBe(0);
    expect(usage.byChat).toEqual([]);
  });
});

describe('countCachedMessages', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('считает количество сообщений в кэше', async () => {
    const db = await openCacheDb();
    await db!.put('messages', { id: 1, chatId: 'c1' } as never);
    await db!.put('messages', { id: 2, chatId: 'c1' } as never);

    expect(await countCachedMessages()).toBe(2);
  });
});

describe('выбор и подсчёт выбранного объёма', () => {
  beforeEach(async () => {
    await clearAllCache();
    await seedMedia([
      meta('p1', 'c1', 'photo', 100),
      meta('f1', 'c1', 'file', 20),
      meta('v1', 'c2', 'video', 300),
      meta('ava-1', null, 'avatar', 10),
    ]);
  });

  it('kindCellKeys покрывает все чаты с этим типом и общий счёт без чата', async () => {
    const usage = await computeStorageUsage();

    const photoKeys = kindCellKeys(usage, 'photo');
    expect(photoKeys).toEqual([chatKindCellKey('c1', 'photo')]);

    const avatarKeys = kindCellKeys(usage, 'avatar');
    expect(selectionTotalBytes(usage, new Set(avatarKeys))).toBe(10);
  });

  it('chatCellKeys покрывает все типы внутри чата', async () => {
    const usage = await computeStorageUsage();
    const c1 = usage.byChat.find((c) => c.chatId === 'c1')!;

    const keys = chatCellKeys(c1);

    expect(new Set(keys)).toEqual(new Set([chatKindCellKey('c1', 'photo'), chatKindCellKey('c1', 'file')]));
    expect(selectionTotalBytes(usage, new Set(keys))).toBe(120);
  });

  it('cellSize отдаёт размер конкретной ячейки', async () => {
    const usage = await computeStorageUsage();

    expect(cellSize(usage, 'c1', 'photo')).toBe(100);
    expect(cellSize(usage, 'c1', 'video')).toBe(0);
    expect(cellSize(usage, null, 'avatar')).toBe(10);
  });
});

describe('clearSelectedMedia', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('удаляет ровно выбранное и не трогает остальное и outbox', async () => {
    await seedMedia([meta('p1', 'c1', 'photo', 100), meta('f1', 'c1', 'file', 20), meta('v1', 'c2', 'video', 300)]);
    const db = await openCacheDb();
    await db!.put('outbox', {
      clientId: 'out-1',
      chatId: 'c1',
      content: 'привет',
      replyToId: null,
      attachment: null,
      createdAt: Date.now(),
      attempts: 0,
    });

    const usage = await computeStorageUsage();
    await clearSelectedMedia(new Set(kindCellKeys(usage, 'photo')));

    expect(await db!.get('media', 'p1')).toBeUndefined();
    expect(await db!.get('mediaMeta', 'p1')).toBeUndefined();
    expect(await db!.get('media', 'f1')).toBeDefined();
    expect(await db!.get('media', 'v1')).toBeDefined();
    expect(await db!.get('outbox', 'out-1')).toBeDefined();
  });

  it('пустой выбор ничего не удаляет', async () => {
    await seedMedia([meta('p1', 'c1', 'photo', 100)]);
    const db = await openCacheDb();

    await clearSelectedMedia(new Set());

    expect(await db!.get('media', 'p1')).toBeDefined();
  });
});

describe('clearAllMedia и clearAllHistory', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('clearAllMedia чистит media и mediaMeta целиком, не трогая outbox', async () => {
    await seedMedia([meta('p1', 'c1', 'photo', 100), meta('v1', 'c2', 'video', 300)]);
    const db = await openCacheDb();
    await db!.put('outbox', {
      clientId: 'out-1',
      chatId: 'c1',
      content: 'привет',
      replyToId: null,
      attachment: null,
      createdAt: Date.now(),
      attempts: 0,
    });

    await clearAllMedia();

    expect(await db!.count('media')).toBe(0);
    expect(await db!.count('mediaMeta')).toBe(0);
    expect(await db!.get('outbox', 'out-1')).toBeDefined();
  });

  it('clearAllHistory чистит только сообщения', async () => {
    const db = await openCacheDb();
    await db!.put('messages', { id: 1, chatId: 'c1' } as never);
    await db!.put('outbox', {
      clientId: 'out-1',
      chatId: 'c1',
      content: 'привет',
      replyToId: null,
      attachment: null,
      createdAt: Date.now(),
      attempts: 0,
    });

    await clearAllHistory();

    expect(await db!.count('messages')).toBe(0);
    expect(await db!.get('outbox', 'out-1')).toBeDefined();
  });
});
