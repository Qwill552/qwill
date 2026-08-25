import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAllCache, openCacheDb } from './db';
import { readCachedChats, readCachedMessages, removeCachedChat, removeCachedMessages, writeCachedChats, writeCachedMessages } from './messageCache';

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
});
