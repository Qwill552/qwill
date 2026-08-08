import type { ChatListItemDto, MessageDto } from '@messenger/shared';

import { openCacheDb } from './db';

export const CACHED_HISTORY_LIMIT = 200;

export async function readCachedChats(): Promise<ChatListItemDto[]> {
  const db = await openCacheDb();
  if (!db) return [];

  const chats = await db.getAll('chats');
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function writeCachedChats(chats: ChatListItemDto[]): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const tx = db.transaction('chats', 'readwrite');
  await tx.store.clear();
  await Promise.all(chats.map((chat) => tx.store.put(chat)));
  await tx.done;
}

export async function readCachedMessages(chatId: string): Promise<MessageDto[]> {
  const db = await openCacheDb();
  if (!db) return [];

  const messages = await db.getAllFromIndex('messages', 'byChat', chatId);
  return messages.sort((a, b) => a.id - b.id).slice(-CACHED_HISTORY_LIMIT);
}

export async function writeCachedMessages(messages: MessageDto[]): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const persistable = messages.filter((message) => message.id > 0);
  if (persistable.length === 0) return;

  const tx = db.transaction('messages', 'readwrite');
  await Promise.all(persistable.map((message) => tx.store.put(message)));
  await tx.done;
}

export async function removeCachedMessages(chatId: string, ids: number[]): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const tx = db.transaction('messages', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete([chatId, id])));
  await tx.done;
}
