import type { MessageDto } from '@messenger/shared';

import { syncMessagesRequest } from '../api/chats';
import { openCacheDb } from './db';
import { removeCachedMessages, writeCachedMessages } from './messageCache';

export function mergeSyncedMessages(
  current: MessageDto[],
  created: MessageDto[],
  changed: MessageDto[],
): MessageDto[] {
  const changedById = new Map(changed.map((message) => [message.id, message]));
  const pending = current.filter((message) => message.id < 0);

  const confirmed = current
    .filter((message) => message.id > 0)
    .map((message) => changedById.get(message.id) ?? message)
    .filter((message) => !message.deletedAt);

  const known = new Set(confirmed.map((message) => message.id));
  const appended = created.filter((message) => !known.has(message.id) && !message.deletedAt);

  return [...pending, ...confirmed, ...appended].sort((a, b) => {
    if (a.id < 0 && b.id < 0) return 0;
    if (a.id < 0) return -1;
    if (b.id < 0) return 1;
    return a.id - b.id;
  });
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
