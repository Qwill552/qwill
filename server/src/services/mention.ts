import { findMentions, MENTIONS_LIST_LIMIT } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { assertMember } from './chat.js';

export interface MentionSource {
  id: number;
  chatId: string;
  senderId: string;
  content: string | null;
  replyToSenderId: string | null;
}

export async function recordMentions(source: MentionSource): Promise<string[]> {
  const chat = await prisma.chat.findUnique({ where: { id: source.chatId }, select: { type: true } });
  if (chat?.type !== 'GROUP') return [];

  const usernames = [...new Set(findMentions(source.content ?? '').map((mention) => mention.username))];
  const candidateFilters = [
    ...(usernames.length > 0 ? [{ user: { username: { in: usernames } } }] : []),
    ...(source.replyToSenderId ? [{ userId: source.replyToSenderId }] : []),
  ];
  if (candidateFilters.length === 0) return [];

  const members = await prisma.chatMember.findMany({
    where: { chatId: source.chatId, userId: { not: source.senderId }, OR: candidateFilters },
    select: { userId: true },
  });
  const userIds = members.map((member) => member.userId);
  if (userIds.length === 0) return [];

  await prisma.messageMention.createMany({
    data: userIds.map((userId) => ({ messageId: source.id, userId, chatId: source.chatId })),
    skipDuplicates: true,
  });
  return userIds;
}

function unreadMentionsWhere(userId: string) {
  return { userId, readAt: null, message: { deletedAt: null } };
}

export async function countUnreadMentions(
  chatId: string,
  userId: string,
  clearedUpToMessageId: number | null,
): Promise<number> {
  return prisma.messageMention.count({
    where: { ...unreadMentionsWhere(userId), chatId, messageId: { gt: clearedUpToMessageId ?? 0 } },
  });
}

export async function countUnreadMentionsByChat(
  userId: string,
  clearedUpTo: Map<string, number | null>,
): Promise<Map<string, number>> {
  const rows = await prisma.messageMention.findMany({
    where: { ...unreadMentionsWhere(userId), chatId: { in: [...clearedUpTo.keys()] } },
    select: { chatId: true, messageId: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.messageId <= (clearedUpTo.get(row.chatId) ?? 0)) continue;
    counts.set(row.chatId, (counts.get(row.chatId) ?? 0) + 1);
  }
  return counts;
}

async function clearedUpToOf(chatId: string, userId: string): Promise<number | null> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { clearedUpToMessageId: true },
  });
  return member?.clearedUpToMessageId ?? null;
}

export async function listUnreadMentionIds(chatId: string, userId: string): Promise<number[]> {
  await assertMember(chatId, userId);

  const clearedUpTo = await clearedUpToOf(chatId, userId);
  const rows = await prisma.messageMention.findMany({
    where: { ...unreadMentionsWhere(userId), chatId, messageId: { gt: clearedUpTo ?? 0 } },
    orderBy: { messageId: 'asc' },
    take: MENTIONS_LIST_LIMIT,
    select: { messageId: true },
  });
  return rows.map((row) => row.messageId);
}

export async function readMentions(chatId: string, userId: string, messageIds?: number[]): Promise<number> {
  await assertMember(chatId, userId);

  await prisma.messageMention.updateMany({
    where: {
      chatId,
      userId,
      readAt: null,
      ...(messageIds ? { messageId: { in: messageIds } } : {}),
    },
    data: { readAt: new Date() },
  });

  return countUnreadMentions(chatId, userId, await clearedUpToOf(chatId, userId));
}
