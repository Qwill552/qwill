import type { MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache } from './db';
import { readCachedMessages, removeCachedMessages, writeCachedMessages } from './messageCache';

function message(id: number, chatId = 'c1'): MessageDto {
  return {
    id,
    chatId,
    clientId: null,
    sender: null,
    type: 'TEXT',
    content: `сообщение ${id}`,
    attachment: null,
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(id * 1000).toISOString(),
  } as MessageDto;
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

  it('удаляет указанные сообщения', async () => {
    await writeCachedMessages([message(1), message(2)]);

    await removeCachedMessages('c1', [1]);

    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([2]);
  });
});
