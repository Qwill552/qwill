import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache, openCacheDb, type CachedVideoChunk } from './db';
import {
  assembleRange,
  chunkIndexesFor,
  chunkRange,
  collectVideoUsage,
  contentRangeHeader,
  parseContentRangeTotal,
  parseRangeHeader,
  parseRangeStart,
  parseStreamUrl,
  planServedRange,
  selectExpiredVideoChunks,
  selectVideoVictims,
  streamUrl,
  type VideoChunkEntry,
} from './videoCache';

const CHUNK = 1000;

describe('parseRangeHeader', () => {
  it('без заголовка отдаёт файл целиком', () => {
    expect(parseRangeHeader(null, 5000)).toEqual({ start: 0, end: 4999 });
  });

  it('открытый диапазон дотягивается до конца файла', () => {
    expect(parseRangeHeader('bytes=1000-', 5000)).toEqual({ start: 1000, end: 4999 });
  });

  it('закрытый диапазон обрезается по размеру файла', () => {
    expect(parseRangeHeader('bytes=100-99999', 5000)).toEqual({ start: 100, end: 4999 });
  });

  it('хвостовой диапазон отсчитывается от конца', () => {
    expect(parseRangeHeader('bytes=-500', 5000)).toEqual({ start: 4500, end: 4999 });
  });

  it('начало за пределами файла недопустимо', () => {
    expect(parseRangeHeader('bytes=5000-', 5000)).toBeNull();
  });

  it('кривой заголовок недопустим', () => {
    expect(parseRangeHeader('bytes=abc-def', 5000)).toBeNull();
    expect(parseRangeHeader('items=0-10', 5000)).toBeNull();
  });
});

describe('parseRangeStart', () => {
  it('без заголовка начало нулевое', () => {
    expect(parseRangeStart(null)).toBe(0);
  });

  it('берёт начало из заголовка', () => {
    expect(parseRangeStart('bytes=2048-4095')).toBe(2048);
  });

  it('для хвостового диапазона начало неизвестно', () => {
    expect(parseRangeStart('bytes=-500')).toBeNull();
  });
});

describe('parseContentRangeTotal', () => {
  it('достаёт размер файла из ответа 206', () => {
    expect(parseContentRangeTotal('bytes 0-511/2048')).toBe(2048);
  });

  it('достаёт размер файла из ответа 416', () => {
    expect(parseContentRangeTotal('bytes */2048')).toBe(2048);
  });

  it('на пустом заголовке отдаёт null', () => {
    expect(parseContentRangeTotal(null)).toBeNull();
  });
});

describe('planServedRange', () => {
  it('короткий запрос отдаётся целиком', () => {
    expect(planServedRange({ start: 0, end: 499 }, 10_000, CHUNK, 2 * CHUNK)).toEqual({ start: 0, end: 499 });
  });

  it('длинный запрос режется по границе куска', () => {
    expect(planServedRange({ start: 0, end: 9999 }, 10_000, CHUNK, 2 * CHUNK)).toEqual({ start: 0, end: 1999 });
  });

  it('несовпадающее с границей начало не тянет лишний кусок целиком', () => {
    expect(planServedRange({ start: 500, end: 9999 }, 10_000, CHUNK, 2 * CHUNK)).toEqual({ start: 500, end: 2999 });
  });

  it('конец файла ближе границы куска', () => {
    expect(planServedRange({ start: 0, end: 1500 }, 1500, CHUNK, 2 * CHUNK)).toEqual({ start: 0, end: 1499 });
  });
});

describe('chunkIndexesFor', () => {
  it('перечисляет куски, покрывающие диапазон', () => {
    expect(chunkIndexesFor({ start: 500, end: 2999 }, CHUNK)).toEqual([0, 1, 2]);
  });

  it('диапазон внутри одного куска даёт один номер', () => {
    expect(chunkIndexesFor({ start: 1100, end: 1200 }, CHUNK)).toEqual([1]);
  });

  it('перемотка в середину не тянет начало файла', () => {
    expect(chunkIndexesFor({ start: 50_000, end: 50_999 }, CHUNK)).toEqual([50]);
  });
});

describe('chunkRange', () => {
  it('обычный кусок ровно по размеру', () => {
    expect(chunkRange(2, 10_000, CHUNK)).toEqual({ start: 2000, end: 2999 });
  });

  it('последний кусок обрезан по размеру файла', () => {
    expect(chunkRange(2, 2500, CHUNK)).toEqual({ start: 2000, end: 2499 });
  });
});

function filled(length: number, value: number): ArrayBuffer {
  return new Uint8Array(length).fill(value).buffer;
}

describe('assembleRange', () => {
  it('склеивает два куска и обрезает края по запросу', () => {
    const body = assembleRange(
      [
        { index: 0, bytes: filled(CHUNK, 1) },
        { index: 1, bytes: filled(CHUNK, 2) },
      ],
      { start: 900, end: 1099 },
      CHUNK,
    );

    expect(body.length).toBe(200);
    expect(body[0]).toBe(1);
    expect(body[99]).toBe(1);
    expect(body[100]).toBe(2);
    expect(body[199]).toBe(2);
  });

  it('короткий последний кусок не выходит за границы ответа', () => {
    const body = assembleRange([{ index: 2, bytes: filled(500, 7) }], { start: 2000, end: 2499 }, CHUNK);

    expect(body.length).toBe(500);
    expect(body[499]).toBe(7);
  });
});

describe('contentRangeHeader', () => {
  it('пишет честный диапазон и размер файла', () => {
    expect(contentRangeHeader({ start: 0, end: 1999 }, 10_000)).toBe('bytes 0-1999/10000');
  });
});

describe('streamUrl', () => {
  it('адрес несёт номер файла и чат, но не токен', () => {
    expect(streamUrl('file-1', 'chat-1')).toBe('/media/file-1?chat=chat-1');
    expect(streamUrl('file-1', null)).toBe('/media/file-1');
  });

  it('разбирается обратно', () => {
    expect(parseStreamUrl('/media/file-1', '?chat=chat-1')).toEqual({ fileId: 'file-1', chatId: 'chat-1' });
    expect(parseStreamUrl('/media/file-1', '')).toEqual({ fileId: 'file-1', chatId: null });
    expect(parseStreamUrl('/assets/index.js', '')).toBeNull();
  });
});

function entry(key: string, size: number, lastUsedAt: number, chatId: string | null = 'c1'): VideoChunkEntry {
  return { key, chatId, size, lastUsedAt };
}

describe('selectVideoVictims', () => {
  it('в пределах потолка никого не выселяет', () => {
    expect(selectVideoVictims([entry('a', 100, 1), entry('b', 100, 2)], 1000)).toEqual([]);
  });

  it('выселяет самые давние, пока не уйдёт под три четверти потолка', () => {
    const victims = selectVideoVictims(
      [entry('new', 400, 300), entry('old', 400, 100), entry('mid', 400, 200)],
      1000,
    );

    expect(victims).toEqual(['old', 'mid']);
  });
});

describe('selectExpiredVideoChunks', () => {
  it('срок считается по чату, вечный срок не трогается', () => {
    const now = 10_000;
    const victims = selectExpiredVideoChunks(
      [entry('stale', 100, 1000, 'c1'), entry('fresh', 100, 9900, 'c1'), entry('avatarish', 100, 0, null)],
      now,
      (chatId) => (chatId === null ? Infinity : 5000),
    );

    expect(victims).toEqual(['stale']);
  });
});

function chunk(key: string, fileId: string, chatId: string | null, size: number): CachedVideoChunk {
  return { key, fileId, index: 0, chatId, size, totalSize: size, lastUsedAt: Date.now() };
}

describe('collectVideoUsage', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('складывает размер кусков по чатам', async () => {
    const db = await openCacheDb();
    const tx = db!.transaction('videoChunks', 'readwrite');
    for (const value of [
      chunk('k1', 'f1', 'c1', 100),
      chunk('k2', 'f1', 'c1', 200),
      chunk('k3', 'f2', 'c2', 50),
      chunk('k4', 'f3', null, 10),
    ]) {
      await tx.store.put(value);
    }
    await tx.done;

    const usage = await collectVideoUsage();

    expect(usage.total).toBe(360);
    expect(usage.byChat.get('c1')).toBe(300);
    expect(usage.byChat.get('c2')).toBe(50);
    expect(usage.byChat.get(null)).toBe(10);
  });
});
