import type { ChatListItemDto, MessageDto, MessagesSyncResponse } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ChatsApi from '../api/chats';

vi.mock('../api/chats', async (importOriginal) => {
  const actual = await importOriginal<typeof ChatsApi>();
  return { ...actual, getMessagesRequest: vi.fn(), syncMessagesRequest: vi.fn() };
});

const { getMessagesRequest, syncMessagesRequest } = await import('../api/chats');
const { clearAllCache } = await import('./db');
const { readCachedMessages, readCachedRanges, recordCachedRange, writeCachedMessages } = await import('./messageCache');
const { NetworkError } = await import('../api/client');
const { SYNC_PAGE_LIMIT, establishSyncCursor, hasSyncCursor, mergeSyncedMessages, readSyncCursors, selectSyncTargets, syncChat } =
  await import('./syncEngine');

function message(id: number, content: string, deletedAt: string | null = null): MessageDto {
  return {
    id,
    chatId: 'c1',
    clientId: null,
    albumId: null,
    sender: null,
    type: 'TEXT',
    content,
    attachment: null,
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    announcement: null,
    reactions: [],
    editedAt: null,
    deletedAt,
    createdAt: new Date(Math.abs(id) * 1000).toISOString(),
  } as MessageDto;
}

describe('mergeSyncedMessages', () => {
  it('дописывает новые сообщения в конец', () => {
    const merged = mergeSyncedMessages([message(1, 'первое')], [message(2, 'второе')], []);

    expect(merged.map((m) => m.id)).toEqual([1, 2]);
  });

  it('заменяет отредактированное сообщение на месте', () => {
    const merged = mergeSyncedMessages([message(1, 'старое'), message(2, 'второе')], [], [message(1, 'новое')]);

    expect(merged.map((m) => m.content)).toEqual(['новое', 'второе']);
  });

  it('выбрасывает удалённое сообщение из ленты', () => {
    const merged = mergeSyncedMessages([message(1, 'а'), message(2, 'б')], [], [message(1, null as never, '2026-08-08T00:00:00.000Z')]);

    expect(merged.map((m) => m.id)).toEqual([2]);
  });

  it('держит оптимистичные сообщения в хвосте ленты', () => {
    const merged = mergeSyncedMessages([message(-1, 'отправляется')], [message(4, 'пришло')], []);

    expect(merged.map((m) => m.id)).toEqual([4, -1]);
  });

  it('не переставляет оптимистичные сообщения между собой', () => {
    const older = { ...message(-2, 'первое'), createdAt: '2026-08-25T10:00:00.000Z' };
    const newer = { ...message(-1, 'второе'), createdAt: '2026-08-25T10:00:01.000Z' };

    const merged = mergeSyncedMessages([older, newer], [message(4, 'пришло')], []);

    expect(merged.map((m) => m.content)).toEqual(['пришло', 'первое', 'второе']);
  });

  it('обновляет уже известное сообщение, даже если оно пришло в created', () => {
    const merged = mergeSyncedMessages([message(1, 'старое'), message(2, 'второе')], [message(1, 'новое')], []);

    expect(merged.map((m) => m.content)).toEqual(['новое', 'второе']);
  });
});

function listItem(id: string, lastId: number | null): ChatListItemDto {
  return {
    id,
    type: 'PRIVATE',
    title: id,
    avatarUrl: null,
    otherMember: null,
    lastMessage: lastId === null ? null : { ...message(lastId, 'x'), chatId: id },
    updatedAt: new Date().toISOString(),
    unreadCount: 0,
    muted: false,
    isSupportRequest: false,
    iBlocked: false,
    blockedMe: false,
  };
}

function page(created: MessageDto[], hasMore: boolean, changed: MessageDto[] = []): MessagesSyncResponse {
  const ids = created.map((m) => m.id);
  return {
    created,
    changed,
    maxId: ids.length > 0 ? Math.max(...ids) : null,
    maxUpdatedAt: new Date(Date.now()).toISOString(),
    hasMore,
  };
}

describe('selectSyncTargets', () => {
  it('открытый чат первым, остальные — только с новыми сообщениями и курсором', () => {
    const cursors = new Map([
      ['same', { maxId: 10, maxUpdatedAt: null }],
      ['behind', { maxId: 5, maxUpdatedAt: null }],
      ['open', { maxId: 1, maxUpdatedAt: null }],
    ]);
    const chats = [listItem('same', 10), listItem('behind', 8), listItem('fresh', 3), listItem('empty', null), listItem('open', 1)];

    expect(selectSyncTargets(chats, cursors, 'open')).toEqual(['open', 'behind']);
    expect(selectSyncTargets(chats, cursors, null)).toEqual(['behind']);
  });
});

describe('syncChat', () => {
  beforeEach(async () => {
    await clearAllCache();
    vi.mocked(getMessagesRequest).mockReset();
    vi.mocked(syncMessagesRequest).mockReset();
  });

  it('чат без курсора получает хвост, а не /sync с нуля', async () => {
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(8, 'а'), message(9, 'б')], hasMore: true });

    const result = await syncChat('c1');

    expect(syncMessagesRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'reset', messages: [message(8, 'а'), message(9, 'б')], hasMore: true });
    expect((await readSyncCursors()).get('c1')).toEqual({ maxId: 9, maxUpdatedAt: message(9, 'б').createdAt });
  });

  it('повторяет догон, пока сервер говорит «есть ещё»', async () => {
    await establishSyncCursor('c1', [message(1, 'а')]);
    vi.mocked(syncMessagesRequest)
      .mockResolvedValueOnce(page([message(2, 'б')], true, [message(1, 'правка')]))
      .mockResolvedValueOnce(page([message(3, 'в')], false));

    const result = await syncChat('c1');

    expect(syncMessagesRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(syncMessagesRequest).mock.calls[1]?.[1]).toBe(2);
    expect(result).toEqual({ kind: 'delta', created: [message(2, 'б'), message(3, 'в')], changed: [message(1, 'правка')] });
    expect((await readCachedMessages('c1')).map((m) => m.content)).toEqual(['правка', 'б', 'в']);
    expect((await readSyncCursors()).get('c1')?.maxId).toBe(3);
  });

  it('после пяти страниц сбрасывает историю чата и грузит свежий хвост', async () => {
    await establishSyncCursor('c1', [message(1, 'старое')]);
    await recordCachedRange('c1', 1, 1);
    let next = 2;
    vi.mocked(syncMessagesRequest).mockImplementation(async () => page([message(next++, 'догон')], true));
    vi.mocked(getMessagesRequest).mockResolvedValue({ messages: [message(900, 'хвост')], hasMore: true });

    const result = await syncChat('c1');

    expect(syncMessagesRequest).toHaveBeenCalledTimes(SYNC_PAGE_LIMIT);
    expect(result).toEqual({ kind: 'reset', messages: [message(900, 'хвост')], hasMore: true });
    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([900]);
    expect(await readCachedRanges('c1')).toEqual([]);
    expect((await readSyncCursors()).get('c1')?.maxId).toBe(900);
  });

  it('обрыв посреди догона отдаёт то, что успело прийти', async () => {
    await establishSyncCursor('c1', [message(1, 'а')]);
    vi.mocked(syncMessagesRequest)
      .mockResolvedValueOnce(page([message(2, 'б')], true))
      .mockRejectedValueOnce(new NetworkError());

    const result = await syncChat('c1');

    expect(result).toEqual({ kind: 'delta', created: [message(2, 'б')], changed: [] });
    expect((await readSyncCursors()).get('c1')?.maxId).toBe(2);
  });

  it('без сети и без пришедшего ничего не отдаёт', async () => {
    await establishSyncCursor('c1', [message(1, 'а')]);
    vi.mocked(syncMessagesRequest).mockRejectedValueOnce(new NetworkError());

    expect(await syncChat('c1')).toBeNull();
  });

  it('курсор из хвоста выбрасывает прежнюю историю чата', async () => {
    await writeCachedMessages([message(1, 'давнее'), { ...message(2, 'чужой чат'), chatId: 'c2' }]);
    expect(await hasSyncCursor('c1')).toBe(false);

    await establishSyncCursor('c1', [message(50, 'хвост')]);

    expect(await hasSyncCursor('c1')).toBe(true);
    expect((await readCachedMessages('c1')).map((m) => m.id)).toEqual([50]);
    expect(await readCachedMessages('c2')).toHaveLength(1);
  });
});
