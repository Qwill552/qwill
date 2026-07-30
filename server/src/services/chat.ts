import type { ChatDto, ChatListItemDto, ChatMemberSummary, MessagesPage } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { toMessageDto } from './message.js';
import type { Chat, ChatMember, Message, User } from '../generated/prisma/client.js';

type ChatWithRelations = Chat & {
  members: (ChatMember & { user: User })[];
  messages: (Message & { sender: User | null })[];
};

function toMemberSummary(
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'lastSeenAt'>,
): ChatMemberSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

function toChatListItem(chat: ChatWithRelations, userId: string, unreadCount: number): ChatListItemDto {
  const other = chat.type === 'PRIVATE' ? chat.members.find((m) => m.userId !== userId) : undefined;
  const otherSummary = other ? toMemberSummary(other.user) : null;
  const lastMessageRow = chat.messages[0];

  return {
    id: chat.id,
    type: chat.type,
    title: chat.type === 'GROUP' ? (chat.title ?? 'Группа') : (otherSummary?.displayName ?? 'Пользователь'),
    avatarUrl: chat.type === 'GROUP' ? chat.avatarUrl : (otherSummary?.avatarUrl ?? null),
    otherMember: otherSummary,
    lastMessage: lastMessageRow ? toMessageDto(lastMessageRow) : null,
    updatedAt: chat.updatedAt.toISOString(),
    unreadCount,
  };
}

/** Сообщения чужих авторов с id больше курсора прочтения (секция 2: lastReadMessageId вместо is_read). */
function countUnread(chatId: string, userId: string, lastReadMessageId: number | null): Promise<number> {
  return prisma.message.count({
    where: {
      chatId,
      senderId: { not: userId },
      id: { gt: lastReadMessageId ?? 0 },
    },
  });
}

const chatWithListRelations = {
  members: { include: { user: true } },
  messages: { orderBy: { id: 'desc' as const }, take: 1, include: { sender: true } },
};

/** Проверка членства — вызывается любым сервисом, работающим с чатом (секция 3). */
export async function assertMember(chatId: string, userId: string): Promise<void> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  if (member) return;

  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound(ErrorCode.CHAT_NOT_FOUND, 'Чат не найден');
  throw forbidden('Вы не участник этого чата', ErrorCode.NOT_A_MEMBER);
}

function pairKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export interface PrivateChatResult {
  chatId: string;
  isNew: boolean;
  targetUserId: string;
}

/** Создание приватного чата защищено уникальным pairKey от гонки при обеих сторонах (секция 2). */
export async function getOrCreatePrivateChat(userId: string, targetUsername: string): Promise<PrivateChatResult> {
  const target = await prisma.user.findUnique({ where: { username: targetUsername } });
  if (!target) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');
  if (target.id === userId) throw badRequest(ErrorCode.VALIDATION_FAILED, 'Нельзя создать чат с самим собой');

  const pairKey = pairKeyFor(userId, target.id);
  const existing = await prisma.chat.findUnique({ where: { pairKey } });
  if (existing) return { chatId: existing.id, isNew: false, targetUserId: target.id };

  try {
    const chat = await prisma.chat.create({
      data: {
        type: 'PRIVATE',
        pairKey,
        createdById: userId,
        members: {
          createMany: {
            data: [{ userId }, { userId: target.id }],
          },
        },
      },
    });
    return { chatId: chat.id, isNew: true, targetUserId: target.id };
  } catch {
    // Гонка: обе стороны создали чат одновременно, unique(pairKey) отклонил вторую попытку.
    const afterRace = await prisma.chat.findUnique({ where: { pairKey } });
    if (afterRace) return { chatId: afterRace.id, isNew: false, targetUserId: target.id };
    throw notFound(ErrorCode.CHAT_NOT_FOUND, 'Не удалось создать чат');
  }
}

export async function listChats(userId: string): Promise<ChatListItemDto[]> {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    include: { chat: { include: chatWithListRelations } },
  });

  const items = await Promise.all(
    memberships.map(async (membership) => {
      const unreadCount = await countUnread(membership.chatId, userId, membership.lastReadMessageId);
      return toChatListItem(membership.chat, userId, unreadCount);
    }),
  );

  return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getChatDetail(chatId: string, userId: string): Promise<ChatDto> {
  await assertMember(chatId, userId);

  const chat = await prisma.chat.findUniqueOrThrow({
    where: { id: chatId },
    include: chatWithListRelations,
  });

  const own = chat.members.find((m) => m.userId === userId) ?? null;
  const unreadCount = await countUnread(chatId, userId, own?.lastReadMessageId ?? null);
  const readCursors = Object.fromEntries(chat.members.map((m) => [m.userId, m.lastReadMessageId]));

  return {
    ...toChatListItem(chat, userId, unreadCount),
    members: chat.members.map((m) => toMemberSummary(m.user)),
    readCursors,
  };
}

/** Курсор прочтения не может уйти назад — обновляем только если новое значение больше текущего (секция 3). */
export async function markChatRead(chatId: string, userId: string, messageId: number): Promise<number> {
  await assertMember(chatId, userId);

  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  const nextCursor = Math.max(member.lastReadMessageId ?? 0, messageId);
  if (nextCursor === member.lastReadMessageId) return nextCursor;

  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { lastReadMessageId: nextCursor },
  });
  return nextCursor;
}

/** Все пользователи, с которыми у userId есть общий чат — получатели его presence-событий (секция 3). */
export async function getCoMemberIds(userId: string): Promise<string[]> {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { chatId: true },
  });
  if (memberships.length === 0) return [];

  const coMembers = await prisma.chatMember.findMany({
    where: { chatId: { in: memberships.map((m) => m.chatId) }, userId: { not: userId } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return coMembers.map((m) => m.userId);
}

export async function getMessages(
  chatId: string,
  userId: string,
  before: number | undefined,
  limit: number,
): Promise<MessagesPage> {
  await assertMember(chatId, userId);

  const rows = await prisma.message.findMany({
    where: { chatId, ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: 'desc' },
    take: limit + 1,
    include: { sender: true },
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: page.map(toMessageDto), hasMore };
}
