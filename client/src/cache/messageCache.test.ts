import { MESSAGES_PAGE_SIZE, type ChatListItemDto, type MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAllCache, openCacheDb } from './db';
import {
  CACHED_HISTORY_LIMIT,
  CACHED_POSITION_TTL_MS,
  pruneCachedHistory,
  pruneCachedPositions,
  readCachedChats,
  readCachedMessages,
  readCachedPosition,
  removeCachedChat,
  removeCachedMessages,
  selectHistoryPruneVictims,
  writeCachedChats,
  writeCachedMessages,
  writeCachedPosition,
} from './messageCache';

function message(id: number, chatId = 'c1'): MessageDto {
  return {
    id,
    chatId,
    clientId: null,
    albumId: null,
    sender: null,
    type: 'TEXT',
    content: `сообщение ${id}`,
    attachment: null,
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    announcement: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(id * 1000).toISOString(),
  } as MessageDto;
}

function chat(id: string): ChatListItemDto {
  return {
    id,
    type: 'PRIVATE',
    title: `Чат ${id}`,
    avatarUrl: null,
    otherMember: null,
    lastMessage: null,
    updatedAt: new Date().toISOString(),
    unreadCount: 0,
    muted: false,
    isSupportRequest: false,
  };
}

describe('messageCache', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('возвращает сообщения чата по возрастанию id', async () => {
    await writeCachedMessages([message(3), message(1), message(2)]);

    const stored = await readCachedMessages('c1');

    expect(stored.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('не смешивает чаты', async () => {
    await writeCachedMessages([message(1, 'c1'), message(1, 'c2')]);

    expect(await readCachedMessages('c2')).toHaveLength(1);
  });

  it('не сохраняет оптимистичные сообщения', async () => {
    await writeCachedMessages([message(-1), message(5)]);

    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([5]);
  });

  it('не сохраняет удалённые сообщения', async () => {
    const buried = { ...message(4), content: null, deletedAt: '2026-08-25T07:00:00.000Z' } as MessageDto;

    await writeCachedMessages([message(3), buried]);

    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([3]);
  });

  it('выбрасывает удалённые сообщения, попавшие в кэш раньше, и вычищает их из хранилища', async () => {
    const db = await openCacheDb();
    await db?.put('messages', { ...message(4), content: null, deletedAt: '2026-08-25T07:00:00.000Z' } as MessageDto);
    await writeCachedMessages([message(3)]);

    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([3]);

    await vi.waitFor(async () => expect(await db?.get('messages', ['c1', 4])).toBeUndefined());
  });

  it('удаляет указанные сообщения', async () => {
    await writeCachedMessages([message(1), message(2)]);

    await removeCachedMessages('c1', [1]);

    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([2]);
  });

  it('removeCachedChat убирает чат, его сообщения и курсор синка, не трогая другие чаты', async () => {
    await writeCachedChats([chat('c1'), chat('c2')]);
    await writeCachedMessages([message(1, 'c1'), message(1, 'c2')]);
    const db = await openCacheDb();
    await db?.put('syncCursors', { chatId: 'c1', maxId: 1, maxUpdatedAt: null });

    await removeCachedChat('c1');

    expect((await readCachedChats()).map((c) => c.id)).toEqual(['c2']);
    expect(await readCachedMessages('c1')).toEqual([]);
    expect(await readCachedMessages('c2')).toHaveLength(1);
    expect(await db?.get('syncCursors', 'c1')).toBeUndefined();
  });

  it('removeCachedChat убирает и позицию чата', async () => {
    await writeCachedPosition('c1', { fromId: 10, toId: 90, anchorId: 40, atTail: false });

    await removeCachedChat('c1');

    expect(await readCachedPosition('c1')).toBeNull();
  });

  it('страница из догрузки истории пополняет уже закэшированные сообщения', async () => {
    await writeCachedMessages([message(10), message(11)]);

    await writeCachedMessages([message(8), message(9)]);

    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([8, 9, 10, 11]);
  });

  it('чтение хвоста не превышает потолок на чат', async () => {
    const total = CACHED_HISTORY_LIMIT + 10;
    await writeCachedMessages(Array.from({ length: total }, (_, i) => message(i + 1)));

    const tail = await readCachedMessages('c1');

    expect(tail).toHaveLength(CACHED_HISTORY_LIMIT);
    expect(tail[0]!.id).toBe(total - CACHED_HISTORY_LIMIT + 1);
    expect(tail.at(-1)!.id).toBe(total);
  });

  it('чтение с around отдаёт окно вокруг нужного id без дыр', async () => {
    const total = CACHED_HISTORY_LIMIT + 500;
    await writeCachedMessages(Array.from({ length: total }, (_, i) => message(i + 1)));

    const targetId = Math.floor(total / 2);
    const window = await readCachedMessages('c1', targetId);

    expect(window).toHaveLength(CACHED_HISTORY_LIMIT);
    expect(window.some((m) => m.id === targetId)).toBe(true);
    for (let i = 1; i < window.length; i += 1) {
      expect(window[i]!.id).toBe(window[i - 1]!.id + 1);
    }
  });

  it('around на id вне кэша отдаёт хвост вместо ошибки', async () => {
    await writeCachedMessages([message(1), message(2), message(3)]);

    const window = await readCachedMessages('c1', 999);

    expect(window.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('уборка не трогает чаты, пока общий потолок не превышен', async () => {
    await writeCachedChats([chat('c1')]);
    await writeCachedMessages(Array.from({ length: MESSAGES_PAGE_SIZE * 2 }, (_, i) => message(i + 1, 'c1')));

    await pruneCachedHistory(null);

    expect(await readCachedMessages('c1')).toHaveLength(MESSAGES_PAGE_SIZE * 2);
  });

  it('уборка подрезает старый чат до последней страницы и не трогает открытый', async () => {
    await writeCachedChats([
      { ...chat('c1'), updatedAt: '2026-01-01T00:00:00.000Z' },
      { ...chat('c2'), updatedAt: '2026-02-01T00:00:00.000Z' },
    ]);
    await writeCachedMessages(Array.from({ length: MESSAGES_PAGE_SIZE + 10 }, (_, i) => message(i + 1, 'c1')));
    await writeCachedMessages([message(1, 'c2'), message(2, 'c2')]);

    await pruneCachedHistory('c2', 10);

    const c1After = await readCachedMessages('c1');
    expect(c1After).toHaveLength(MESSAGES_PAGE_SIZE);
    expect(c1After.at(-1)!.id).toBe(MESSAGES_PAGE_SIZE + 10);
    expect(await readCachedMessages('c2')).toHaveLength(2);
  });
});

describe('selectHistoryPruneVictims', () => {
  it('не трогает ничего, пока общий потолок не превышен', () => {
    const chats = [{ chatId: 'c1', updatedAt: '2026-01-01', count: 300 }];

    expect(selectHistoryPruneVictims(chats, 300, null, 500, 50)).toEqual([]);
  });

  it('не трогает открытый чат, даже если он самый старый', () => {
    const chats = [
      { chatId: 'c1', updatedAt: '2026-01-01', count: 300 },
      { chatId: 'c2', updatedAt: '2026-02-01', count: 300 },
    ];

    expect(selectHistoryPruneVictims(chats, 600, 'c1', 500, 50)).toEqual([{ chatId: 'c2', drop: 250 }]);
  });

  it('подрезает чаты по возрастанию updatedAt, пока не уложится в потолок', () => {
    const chats = [
      { chatId: 'old', updatedAt: '2026-01-01', count: 300 },
      { chatId: 'mid', updatedAt: '2026-02-01', count: 300 },
      { chatId: 'new', updatedAt: '2026-03-01', count: 300 },
    ];

    expect(selectHistoryPruneVictims(chats, 900, null, 700, 50)).toEqual([{ chatId: 'old', drop: 250 }]);
  });

  it('пропускает чаты, уже уложившиеся в страницу', () => {
    const chats = [
      { chatId: 'small', updatedAt: '2026-01-01', count: 50 },
      { chatId: 'big', updatedAt: '2026-02-01', count: 300 },
    ];

    expect(selectHistoryPruneVictims(chats, 350, null, 100, 50)).toEqual([{ chatId: 'big', drop: 250 }]);
  });
});

describe('позиция в чате', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('записанная позиция читается обратно', async () => {
    await writeCachedPosition('c1', { fromId: 10, toId: 90, anchorId: 42, atTail: false });

    expect(await readCachedPosition('c1')).toEqual({ fromId: 10, toId: 90, anchorId: 42, atTail: false });
  });

  it('позиции нет — читается null, а не ошибка', async () => {
    expect(await readCachedPosition('нет-такого-чата')).toBeNull();
  });

  it('запись старше месяца считается протухшей', async () => {
    const db = await openCacheDb();
    await db?.put('chatPositions', {
      chatId: 'c1',
      fromId: 1,
      toId: 80,
      anchorId: 20,
      atTail: false,
      savedAt: Date.now() - CACHED_POSITION_TTL_MS - 1000,
    });

    expect(await readCachedPosition('c1')).toBeNull();
  });

  it('уборка оставляет последние позиции и выбрасывает остальные', async () => {
    const db = await openCacheDb();
    for (let index = 0; index < 5; index += 1) {
      await db?.put('chatPositions', {
        chatId: `c${index}`,
        fromId: 1,
        toId: 80,
        anchorId: 20,
        atTail: false,
        savedAt: Date.now() - (5 - index) * 1000,
      });
    }

    await pruneCachedPositions(2);

    expect((await db!.getAll('chatPositions')).map((position) => position.chatId).sort()).toEqual(['c3', 'c4']);
  });

  it('очистка кэша при смене аккаунта убирает позиции', async () => {
    await writeCachedPosition('c1', { fromId: 10, toId: 90, anchorId: 42, atTail: false });

    await clearAllCache();

    expect(await readCachedPosition('c1')).toBeNull();
  });

  it('уборка выбрасывает протухшие записи, даже если потолок не превышен', async () => {
    const db = await openCacheDb();
    await db?.put('chatPositions', {
      chatId: 'старый',
      fromId: 1,
      toId: 80,
      anchorId: 20,
      atTail: false,
      savedAt: Date.now() - CACHED_POSITION_TTL_MS - 1000,
    });
    await writeCachedPosition('свежий', { fromId: 1, toId: 80, anchorId: 20, atTail: false });

    await pruneCachedPositions();

    expect((await db!.getAll('chatPositions')).map((position) => position.chatId)).toEqual(['свежий']);
  });
});
