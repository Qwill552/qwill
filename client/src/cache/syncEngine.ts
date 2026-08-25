import type { MessageDto } from '@messenger/shared';

import { syncMessagesRequest } from '../api/chats';
import { openCacheDb } from './db';
import { removeCachedMessages, writeCachedMessages } from './messageCache';

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

async function readCursor(chatId: string): Promise<{ maxId: number; maxUpdatedAt: string | null }> {
  const db = await openCacheDb();
  if (!db) return { maxId: 0, maxUpdatedAt: null };

  const cursor = await db.get('syncCursors', chatId);
  return { maxId: cursor?.maxId ?? 0, maxUpdatedAt: cursor?.maxUpdatedAt ?? null };
}

async function writeCursor(chatId: string, maxId: number, maxUpdatedAt: string | null): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await db.put('syncCursors', { chatId, maxId, maxUpdatedAt });
}

export async function syncChat(chatId: string): Promise<{ created: MessageDto[]; changed: MessageDto[] } | null> {
  const cursor = await readCursor(chatId);

  try {
    const result = await syncMessagesRequest(chatId, cursor.maxId, cursor.maxUpdatedAt);

    const deletedIds = result.changed.filter((message) => message.deletedAt).map((message) => message.id);
    if (deletedIds.length > 0) await removeCachedMessages(chatId, deletedIds);

    const alive = [...result.created, ...result.changed].filter((message) => !message.deletedAt);
    await writeCachedMessages(alive);

    await writeCursor(
      chatId,
      result.maxId ?? cursor.maxId,
      result.maxUpdatedAt ?? cursor.maxUpdatedAt,
    );

    return { created: result.created, changed: result.changed };
  } catch {
    return null;
  }
}

export async function syncAllCachedChats(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const chats = await db.getAllKeys('chats');
  for (const chatId of chats) {
    await syncChat(chatId);
  }
}
