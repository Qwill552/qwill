import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache, openCacheDb, type MediaTier } from './db';
import {
  evictToBudget,
  MEDIA_ACCESS_THROTTLE_MS,
  removeCachedMediaByFileIds,
  resolveMedia,
  selectEvictionVictims,
  type EvictionCandidate,
} from './mediaCache';

function candidate(fileId: string, size: number, lastUsedAt: number, tier: MediaTier): EvictionCandidate {
  return { fileId, size, lastUsedAt, tier };
}

interface CallTracker {
  names: string[];
  restore: () => void;
}

function trackPuts(): CallTracker {
  const names: string[] = [];
  const original = IDBObjectStore.prototype.put;

  IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
    names.push(this.name);
    return original.apply(this, args);
  };

  return {
    names,
    restore: () => {
      IDBObjectStore.prototype.put = original;
    },
  };
}

function trackBulkReads(): CallTracker {
  const names: string[] = [];
  const storeGetAll = IDBObjectStore.prototype.getAll;
  const storeCursor = IDBObjectStore.prototype.openCursor;
  const indexGetAll = IDBIndex.prototype.getAll;
  const indexCursor = IDBIndex.prototype.openCursor;

  IDBObjectStore.prototype.getAll = function (this: IDBObjectStore, ...args: Parameters<typeof storeGetAll>) {
    names.push(this.name);
    return storeGetAll.apply(this, args);
  };
  IDBObjectStore.prototype.openCursor = function (this: IDBObjectStore, ...args: Parameters<typeof storeCursor>) {
    names.push(this.name);
    return storeCursor.apply(this, args);
  };
  IDBIndex.prototype.getAll = function (this: IDBIndex, ...args: Parameters<typeof indexGetAll>) {
    names.push(this.objectStore.name);
    return indexGetAll.apply(this, args);
  };
  IDBIndex.prototype.openCursor = function (this: IDBIndex, ...args: Parameters<typeof indexCursor>) {
    names.push(this.objectStore.name);
    return indexCursor.apply(this, args);
  };

  return {
    names,
    restore: () => {
      IDBObjectStore.prototype.getAll = storeGetAll;
      IDBObjectStore.prototype.openCursor = storeCursor;
      IDBIndex.prototype.getAll = indexGetAll;
      IDBIndex.prototype.openCursor = indexCursor;
    },
  };
}

async function settleBackgroundWrites(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('selectEvictionVictims', () => {
  it('не трогает ничего, пока бюджет не превышен', () => {
    const victims = selectEvictionVictims([candidate('a', 40, 1, 'full')], 100);

    expect(victims).toEqual([]);
  });

  it('вытесняет самое давнее до 75% бюджета', () => {
    const victims = selectEvictionVictims(
      [candidate('old', 50, 1, 'full'), candidate('mid', 50, 2, 'full'), candidate('new', 50, 3, 'full')],
      100,
    );

    expect(victims).toEqual(['old', 'mid']);
  });

  it('превью вытесняет только после того, как кончились полные файлы', () => {
    const victims = selectEvictionVictims(
      [candidate('thumb-old', 60, 1, 'thumb'), candidate('full-new', 60, 9, 'full')],
      100,
    );

    expect(victims).toEqual(['full-new']);
  });

  it('не трогает аватары, пока в кэше остаётся хоть один полный файл', () => {
    const victims = selectEvictionVictims(
      [
        candidate('avatar', 20, 0, 'avatar'),
        candidate('full-1', 30, 1, 'full'),
        candidate('full-2', 30, 2, 'full'),
        candidate('full-3', 30, 3, 'full'),
        candidate('thumb', 10, 4, 'thumb'),
      ],
      100,
    );

    expect(victims).toEqual(['full-1', 'full-2']);
  });

  it('оставляет аватарам неприкосновенную долю бюджета', () => {
    const victims = selectEvictionVictims(
      [candidate('avatar-old', 96, 1, 'avatar'), candidate('avatar-new', 96, 2, 'avatar')],
      100,
    );

    expect(victims).toEqual(['avatar-old']);
  });
});

describe('чтение из кэша', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('не переписывает блоб ради времени доступа', async () => {
    const db = await openCacheDb();
    await db!.put('media', { fileId: 'r1', tier: 'full', blob: new Blob(['a']), size: 1, lastUsedAt: 0 });

    const puts = trackPuts();
    const blob = await resolveMedia('r1', { tier: 'full', chatId: 'c1', kind: 'photo' });
    await settleBackgroundWrites();
    puts.restore();

    expect(blob).not.toBeNull();
    expect(puts.names).not.toContain('media');
    expect(puts.names).toContain('mediaMeta');
  });

  it('не пишет вообще ничего, пока не истёк порог обновления времени доступа', async () => {
    const db = await openCacheDb();
    await db!.put('media', { fileId: 'r2', tier: 'full', blob: new Blob(['b']), size: 1, lastUsedAt: 0 });
    await db!.put('mediaMeta', {
      fileId: 'r2',
      chatId: 'c1',
      kind: 'photo',
      tier: 'full',
      size: 1,
      lastUsedAt: Date.now(),
    });

    const puts = trackPuts();
    await resolveMedia('r2', { tier: 'full', chatId: 'c1', kind: 'photo' });
    await settleBackgroundWrites();
    puts.restore();

    expect(puts.names).toEqual([]);
  });

  it('обновляет время доступа в мете, когда порог истёк', async () => {
    const db = await openCacheDb();
    await db!.put('media', { fileId: 'r3', tier: 'full', blob: new Blob(['c']), size: 1, lastUsedAt: 0 });
    await db!.put('mediaMeta', {
      fileId: 'r3',
      chatId: 'c1',
      kind: 'photo',
      tier: 'full',
      size: 1,
      lastUsedAt: Date.now() - MEDIA_ACCESS_THROTTLE_MS - 1000,
    });

    const puts = trackPuts();
    await resolveMedia('r3', { tier: 'full', chatId: 'c1', kind: 'photo' });
    await settleBackgroundWrites();
    puts.restore();

    expect(puts.names).toEqual(['mediaMeta']);
    expect((await db!.get('mediaMeta', 'r3'))!.lastUsedAt).toBeGreaterThan(Date.now() - MEDIA_ACCESS_THROTTLE_MS);
  });
});

describe('evictToBudget', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('считает по мете и не поднимает блобы', async () => {
    const db = await openCacheDb();
    await db!.put('media', { fileId: 'e1', tier: 'full', blob: new Blob(['a']), size: 1, lastUsedAt: 1 });
    await db!.put('mediaMeta', { fileId: 'e1', chatId: 'c1', kind: 'photo', tier: 'full', size: 1, lastUsedAt: 1 });

    const reads = trackBulkReads();
    await evictToBudget();
    reads.restore();

    expect(reads.names).not.toContain('media');
    expect(reads.names).toContain('mediaMeta');
  });
});

describe('removeCachedMediaByFileIds', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('удаляет только перечисленные файлы вместе с их метой', async () => {
    const db = await openCacheDb();
    await db?.put('media', { fileId: 'f1', tier: 'full', blob: new Blob(['a']), size: 1, lastUsedAt: 1 });
    await db?.put('media', { fileId: 'f2', tier: 'full', blob: new Blob(['b']), size: 1, lastUsedAt: 2 });
    await db?.put('mediaMeta', { fileId: 'f1', chatId: 'c1', kind: 'photo', tier: 'full', size: 1, lastUsedAt: 1 });
    await db?.put('mediaMeta', { fileId: 'f2', chatId: 'c1', kind: 'photo', tier: 'full', size: 1, lastUsedAt: 2 });

    await removeCachedMediaByFileIds(['f1']);

    expect(await db?.get('media', 'f1')).toBeUndefined();
    expect(await db?.get('mediaMeta', 'f1')).toBeUndefined();
    expect(await db?.get('media', 'f2')).toBeDefined();
    expect(await db?.get('mediaMeta', 'f2')).toBeDefined();
  });
});
