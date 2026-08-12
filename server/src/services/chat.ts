import type { ChatDto, ChatListItemDto, ChatMemberSummary, MessageDto, MessagesPage, UpdateGroupDTO } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { toAvatarColor } from '../lib/avatarColor.js';
import { fileUrl } from '../lib/fileUrl.js';
import { assertAvatarEligible } from './file.js';
import { messageInclude, toMessageDto, type MessageWithRelations } from './message.js';
import type { Chat, ChatMember, User } from '../generated/prisma/client.js';

type ChatWithRelations = Chat & {
  members: (ChatMember & { user: User })[];
  messages: MessageWithRelations[];
};

export function toMemberSummary(
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarFileId' | 'avatarColor' | 'lastSeenAt'>,
): ChatMemberSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: fileUrl(user.avatarFileId),
    avatarColor: toAvatarColor(user.avatarColor),
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
    avatarUrl: chat.type === 'GROUP' ? fileUrl(chat.avatarFileId) : (otherSummary?.avatarUrl ?? null),
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
  messages: { orderBy: { id: 'desc' as const }, take: 1, include: messageInclude },
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

export function pairKeyFor(a: string, b: string): string {
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

export interface GroupChatResult {
  chatId: string;
  /** Все участники, включая создателя — вызывающий код подписывает их сокеты на комнату чата. */
  memberIds: string[];
}

/** Создание группы — создатель становится OWNER, остальные резолвятся по @username в MEMBER
 *  (поиска пользователей по /users/search в этапе 7 ещё нет — только точное имя, как в приватном чате). */
export async function createGroupChat(creatorId: string, title: string, usernames: string[]): Promise<GroupChatResult> {
  const creator = await prisma.user.findUniqueOrThrow({ where: { id: creatorId } });
  const uniqueUsernames = [...new Set(usernames)].filter((u) => u !== creator.username);
  if (uniqueUsernames.length === 0) {
    throw badRequest(ErrorCode.VALIDATION_FAILED, 'Добавьте хотя бы одного участника, кроме себя');
  }

  const users = await prisma.user.findMany({ where: { username: { in: uniqueUsernames } } });
  const foundUsernames = new Set(users.map((u) => u.username));
  const missing = uniqueUsernames.find((u) => !foundUsernames.has(u));
  if (missing) throw notFound(ErrorCode.NOT_FOUND, `Пользователь @${missing} не найден`);

  const chat = await prisma.chat.create({
    data: {
      type: 'GROUP',
      title,
      createdById: creatorId,
      members: {
        createMany: {
          data: [
            { userId: creatorId, role: 'OWNER' },
            ...users.map((u) => ({ userId: u.id, role: 'MEMBER' as const })),
          ],
        },
      },
    },
  });

  return { chatId: chat.id, memberIds: [creatorId, ...users.map((u) => u.id)] };
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

  const pinned = chat.pinnedMessageId
    ? await prisma.message.findUnique({ where: { id: chat.pinnedMessageId }, include: messageInclude })
    : null;

  return {
    ...toChatListItem(chat, userId, unreadCount),
    members: chat.members.map((m) => toMemberSummary(m.user)),
    readCursors,
    pinnedMessage: pinned ? toMessageDto(pinned) : null,
  };
}

export interface PinResult {
  chatId: string;
  message: MessageDto | null;
}

/** Закрепление — messageId=null снимает закреп. Приватный чат: любой участник; группа —
 *  только OWNER/ADMIN, тот же порог, что и updateGroup (этап 6, ux-ui/06). */
export async function pinMessage(chatId: string, userId: string, messageId: number | null): Promise<PinResult> {
  await assertMember(chatId, userId);
  const chat = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } });

  if (chat.type === 'GROUP') {
    const membership = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw forbidden('Только владелец или администратор может закреплять сообщения');
    }
  }

  if (messageId !== null) {
    const target = await prisma.message.findUnique({ where: { id: messageId } });
    if (!target || target.chatId !== chatId || target.deletedAt) {
      throw notFound(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение не найдено');
    }
  }

  await prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: messageId } });
  if (messageId === null) return { chatId, message: null };

  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
  return { chatId, message: toMessageDto(message) };
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
    include: messageInclude,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: page.map(toMessageDto), hasMore };
}

export interface GroupUpdateResult {
  chatId: string;
  title: string;
  avatarUrl: string | null;
  updatedAt: string;
}

/** Название/аватар может менять только OWNER или ADMIN группы (секция «Правило слоёв», этап 7). */
export async function updateGroup(chatId: string, userId: string, input: UpdateGroupDTO): Promise<GroupUpdateResult> {
  await assertMember(chatId, userId);

  const chat = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } });
  if (chat.type !== 'GROUP') throw forbidden('Изменить название и аватар можно только у группы');

  const membership = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
    throw forbidden('Только владелец или администратор может менять данные группы');
  }

  // Тот же proof-of-possession (fileId+sha256), что и для аватара пользователя (секция 7):
  // без него можно было бы угадать id чужого приватного файла и сделать его аватаром группы.
  if (input.avatar) await assertAvatarEligible(input.avatar.fileId, input.avatar.sha256);

  const updated = await prisma.chat.update({
    where: { id: chatId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.avatar !== undefined ? { avatarFileId: input.avatar.fileId } : {}),
    },
  });

  return {
    chatId: updated.id,
    title: updated.title ?? 'Группа',
    avatarUrl: fileUrl(updated.avatarFileId),
    updatedAt: updated.updatedAt.toISOString(),
  };
}
