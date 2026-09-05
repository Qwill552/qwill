import { MESSAGES_PAGE_SIZE, type ChatListItemDto, type MessageDto } from '@messenger/shared';

import { openCacheDb } from './db';
import { FEED_ACCUMULATOR_LIMIT } from '../features/messages/feedWindow';

export const CACHED_HISTORY_LIMIT = Math.max(FEED_ACCUMULATOR_LIMIT, MESSAGES_PAGE_SIZE);

export const CACHED_TOTAL_LIMIT = 20000;

export const CACHED_POSITIONS_LIMIT = 20;

export const CACHED_POSITION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ChatFeedPosition {
  fromId: number | null;
  toId: number | null;
  anchorId: number | null;
  atTail: boolean;
}

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

export async function readCachedMessages(chatId: string, around?: number): Promise<MessageDto[]> {
  const db = await openCacheDb();
  if (!db) return [];

  const messages = await db.getAllFromIndex('messages', 'byChat', chatId);

  const buried = messages.filter((message) => message.deletedAt).map((message) => message.id);
  if (buried.length > 0) void removeCachedMessages(chatId, buried);

  const alive = messages.filter((message) => !message.deletedAt).sort((a, b) => a.id - b.id);
  if (around === undefined || alive.length === 0) return alive.slice(-CACHED_HISTORY_LIMIT);

  const index = alive.findIndex((message) => message.id === around);
  if (index === -1) return alive.slice(-CACHED_HISTORY_LIMIT);

  const last = alive.length - 1;
  const to = Math.min(last, Math.max(0, index - Math.floor(CACHED_HISTORY_LIMIT / 2)) + CACHED_HISTORY_LIMIT - 1);
  const from = Math.max(0, to - CACHED_HISTORY_LIMIT + 1);
  return alive.slice(from, to + 1);
}

export async function writeCachedMessages(messages: MessageDto[]): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  const persistable = messages.filter((message) => message.id > 0 && !message.deletedAt);
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

export async function readCachedPosition(chatId: string): Promise<ChatFeedPosition | null> {
  const db = await openCacheDb();
  if (!db) return null;

  try {
    const stored = await db.get('chatPositions', chatId);
    if (!stored) return null;
    if (Date.now() - stored.savedAt > CACHED_POSITION_TTL_MS) return null;

    const { fromId, toId, anchorId, atTail } = stored;
    return { fromId, toId, anchorId, atTail };
  } catch {
    return null;
  }
}

export async function writeCachedPosition(chatId: string, position: ChatFeedPosition): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    await db.put('chatPositions', { chatId, ...position, savedAt: Date.now() });
  } catch {
    return;
  }
}

export async function pruneCachedPositions(limit: number = CACHED_POSITIONS_LIMIT): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  try {
    const stored = await db.getAllFromIndex('chatPositions', 'bySavedAt');
    const oldest = Date.now() - CACHED_POSITION_TTL_MS;
    const kept = new Set(
      stored
        .filter((position) => position.savedAt >= oldest)
        .slice(-limit)
        .map((position) => position.chatId),
    );

    const victims = stored.filter((position) => !kept.has(position.chatId));
    if (victims.length === 0) return;

    const tx = db.transaction('chatPositions', 'readwrite');
    await Promise.all(victims.map((position) => tx.store.delete(position.chatId)));
    await tx.done;
  } catch {
    return;
  }
}

export async function removeCachedChat(chatId: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await db.delete('chats', chatId);
  await db.delete('syncCursors', chatId);
  await db.delete('chatPositions', chatId);

  const keys = await db.getAllKeysFromIndex('messages', 'byChat', chatId);
  const tx = db.transaction('messages', 'readwrite');
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
}

export interface ChatMessageCount {
  chatId: string;
  updatedAt: string;
  count: number;
}

export interface HistoryPruneVictim {
  chatId: string;
  drop: number;
}

export function selectHistoryPruneVictims(
  chats: ChatMessageCount[],
  totalMessages: number,
  activeChatId: string | null,
  totalLimit: number,
  keepPerChat: number,
): HistoryPruneVictim[] {
  if (totalMessages <= totalLimit) return [];

  const stale = chats
    .filter((chat) => chat.chatId !== activeChatId && chat.count > keepPerChat)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  let remaining = totalMessages;
  const victims: HistoryPruneVictim[] = [];
  for (const chat of stale) {
    if (remaining <= totalLimit) break;

    const drop = chat.count - keepPerChat;
    victims.push({ chatId: chat.chatId, drop });
    remaining -= drop;
  }
  return victims;
}

export async function pruneCachedHistory(
  activeChatId: string | null,
  totalLimit: number = CACHED_TOTAL_LIMIT,
): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await pruneCachedPositions();

  try {
    const total = await db.count('messages');
    if (total <= totalLimit) return;

    const chats = await db.getAll('chats');
    const counts = await Promise.all(
      chats.map(async (chat) => ({
        chatId: chat.id,
        updatedAt: chat.updatedAt,
        count: await db.countFromIndex('messages', 'byChat', chat.id),
      })),
    );

    const victims = selectHistoryPruneVictims(counts, total, activeChatId, totalLimit, MESSAGES_PAGE_SIZE);
    for (const victim of victims) {
      const keys = (await db.getAllKeysFromIndex('messages', 'byChat', victim.chatId)).sort((a, b) => a[1] - b[1]);
      const drop = keys.slice(0, victim.drop);
      const tx = db.transaction('messages', 'readwrite');
      await Promise.all(drop.map((key) => tx.store.delete(key)));
      await tx.done;
    }
  } catch {
    return;
  }
}
