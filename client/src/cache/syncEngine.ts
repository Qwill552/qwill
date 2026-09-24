import type { ChatListItemDto, MessageDto } from '@messenger/shared';

import { getMessagesRequest, syncMessagesRequest } from '../api/chats';
import { openCacheDb } from './db';
import { removeCachedMessages, writeCachedMessages } from './messageCache';

export const SYNC_PAGE_LIMIT = 5;

export interface ChatSyncCursor {
  maxId: number;
  maxUpdatedAt: string | null;
}

export type ChatSyncResult =
  | { kind: 'delta'; created: MessageDto[]; changed: MessageDto[] }
  | { kind: 'reset'; messages: MessageDto[]; hasMore: boolean };

export function mergeSyncedMessages(
  current: MessageDto[],
  created: MessageDto[],
  changed: MessageDto[],
): MessageDto[] {
  const latestById = new Map<number, MessageDto>();
  for (const message of created) latestById.set(message.id, message);
  for (const message of changed) latestById.set(message.id, message);

  const pending = current.filter((message) => message.id < 0);

  const confirmed = current
    .filter((message) => message.id > 0)
    .map((message) => latestById.get(message.id) ?? message)
    .filter((message) => !message.deletedAt);

  const known = new Set(confirmed.map((message) => message.id));
  const appended = [...latestById.values()].filter((message) => !known.has(message.id) && !message.deletedAt);

  const settled = [...confirmed, ...appended].sort((a, b) => a.id - b.id);
  const queued = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return [...settled, ...queued];
}

export function selectSyncTargets(
  chats: ChatListItemDto[],
  cursors: Map<string, ChatSyncCursor>,
  activeChatId: string | null,
): string[] {
  const targets = activeChatId ? [activeChatId] : [];
  for (const chat of chats) {
    if (chat.id === activeChatId) continue;
    const cursor = cursors.get(chat.id);
    const newest = chat.lastMessage?.id;
    if (cursor && newest !== undefined && newest > cursor.maxId) targets.push(chat.id);
  }
  return targets;
}

async function readCursor(chatId: string): Promise<ChatSyncCursor | null> {
  const db = await openCacheDb();
  if (!db) return null;

  const cursor = await db.get('syncCursors', chatId);
  return cursor ? { maxId: cursor.maxId, maxUpdatedAt: cursor.maxUpdatedAt } : null;
}

export async function readSyncCursors(): Promise<Map<string, ChatSyncCursor>> {
  const db = await openCacheDb();
  if (!db) return new Map();

  const cursors = await db.getAll('syncCursors');
  return new Map(cursors.map((cursor) => [cursor.chatId, { maxId: cursor.maxId, maxUpdatedAt: cursor.maxUpdatedAt }]));
}

export async function hasSyncCursor(chatId: string): Promise<boolean> {
  return (await readCursor(chatId)) !== null;
}

async function writeCursor(chatId: string, cursor: ChatSyncCursor): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await db.put('syncCursors', { chatId, maxId: cursor.maxId, maxUpdatedAt: cursor.maxUpdatedAt });
}

async function resetCachedHistory(chatId: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const keys = await db.getAllKeysFromIndex('messages', 'byChat', chatId);
  const tx = db.transaction(['messages', 'messageRanges', 'syncCursors'], 'readwrite');
  await Promise.all([
    ...keys.map((key) => tx.objectStore('messages').delete(key)),
    tx.objectStore('messageRanges').delete(chatId),
    tx.objectStore('syncCursors').delete(chatId),
  ]);
  await tx.done;
}

export async function establishSyncCursor(chatId: string, tail: MessageDto[]): Promise<void> {
  await resetCachedHistory(chatId);
  await writeCachedMessages(tail);
  const newest = tail.reduce<MessageDto | null>((best, message) => (!best || message.id > best.id ? message : best), null);
  await writeCursor(chatId, { maxId: newest?.id ?? 0, maxUpdatedAt: newest?.createdAt ?? null });
}

async function reloadTail(chatId: string): Promise<ChatSyncResult> {
  const page = await getMessagesRequest(chatId);
  await establishSyncCursor(chatId, page.messages);
  return { kind: 'reset', messages: page.messages.filter((message) => !message.deletedAt), hasMore: page.hasMore };
}

export async function syncChat(chatId: string): Promise<ChatSyncResult | null> {
  const created: MessageDto[] = [];
  const changed: MessageDto[] = [];

  try {
    let cursor = await readCursor(chatId);
    if (!cursor) return await reloadTail(chatId);

    for (let page = 1; ; page += 1) {
      const result = await syncMessagesRequest(chatId, cursor.maxId, cursor.maxUpdatedAt);

      const deletedIds = result.changed.filter((message) => message.deletedAt).map((message) => message.id);
      if (deletedIds.length > 0) await removeCachedMessages(chatId, deletedIds);

      const alive = [...result.created, ...result.changed].filter((message) => !message.deletedAt);
      await writeCachedMessages(alive);

      cursor = {
        maxId: result.maxId ?? cursor.maxId,
        maxUpdatedAt: result.maxUpdatedAt ?? cursor.maxUpdatedAt,
      };
      await writeCursor(chatId, cursor);

      created.push(...result.created);
      changed.push(...result.changed);

      if (!result.hasMore) return { kind: 'delta', created, changed };
      if (page >= SYNC_PAGE_LIMIT) return await reloadTail(chatId);
    }
  } catch {
    return created.length > 0 || changed.length > 0 ? { kind: 'delta', created, changed } : null;
  }
}
