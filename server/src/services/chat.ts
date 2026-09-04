import type {
  ChatDto,
  ChatListItemDto,
  ChatMemberSummary,
  MessageDto,
  MessagesAround,
  MessagesPage,
  UpdateGroupDTO,
} from '@messenger/shared';
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
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarFileId' | 'avatarColor' | 'lastSeenAt' | 'isService'>,
): ChatMemberSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: fileUrl(user.avatarFileId),
    avatarColor: toAvatarColor(user.avatarColor),
    lastSeenAt: user.lastSeenAt.toISOString(),
    isService: user.isService,
  };
}

function toChatListItem(chat: ChatWithRelations, userId: string, unreadCount: number): ChatListItemDto {
  const other = chat.type === 'PRIVATE' ? chat.members.find((m) => m.userId !== userId) : undefined;
  const otherSummary = other ? toMemberSummary(other.user) : null;
  const lastMessageRow = chat.messages[0];
  const own = chat.members.find((m) => m.userId === userId);

  return {
    id: chat.id,
    type: chat.type,
    title: chat.type === 'GROUP' ? (chat.title ?? 'Группа') : (otherSummary?.displayName ?? 'Пользователь'),
    avatarUrl: chat.type === 'GROUP' ? fileUrl(chat.avatarFileId) : (otherSummary?.avatarUrl ?? null),
    otherMember: otherSummary,
    lastMessage: lastMessageRow ? toMessageDto(lastMessageRow) : null,
    updatedAt: chat.updatedAt.toISOString(),
    unreadCount,
    muted: own?.mutedAt != null,
    isSupportRequest: chat.isSupportRequest,
  };
}

/** Сообщения чужих авторов с id больше курсора прочтения (секция 2: lastReadMessageId вместо is_read). */
export function countUnread(
  chatId: string,
  userId: string,
  lastReadMessageId: number | null,
  clearedUpToMessageId: number | null,
): Promise<number> {
  const cursor = Math.max(lastReadMessageId ?? 0, clearedUpToMessageId ?? 0);
  return prisma.message.count({
    where: {
      chatId,
      senderId: { not: userId },
      id: { gt: cursor },
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

/** Чат с сервисным аккаунтом только для чтения: писать в него может лишь сам сервисный
 *  аккаунт, остальные получают отказ, каким бы путём отправка ни пришла
 *  (updates/03-announcements-chat.md, шаг 6). */
export async function assertChatWritable(chatId: string, userId: string): Promise<void> {
  const serviceMember = await prisma.chatMember.findFirst({
    where: { chatId, user: { isService: true } },
    select: { userId: true },
  });
  if (!serviceMember || serviceMember.userId === userId) return;

  throw forbidden('В этот чат нельзя писать');
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
  if (!target || target.isService) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');
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

  const users = await prisma.user.findMany({ where: { username: { in: uniqueUsernames }, isService: false } });
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

  const visible = memberships.filter((membership) => {
    if (membership.chat.type === 'PRIVATE' && membership.chat.messages.length === 0) return false;
    if (!membership.hiddenAt) return true;
    const lastMessageId = membership.chat.messages[0]?.id ?? 0;
    return lastMessageId > (membership.clearedUpToMessageId ?? 0);
  });

  const items = await Promise.all(
    visible.map(async (membership) => {
      const unreadCount = await countUnread(
        membership.chatId,
        userId,
        membership.lastReadMessageId,
        membership.clearedUpToMessageId,
      );
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
  const unreadCount = await countUnread(
    chatId,
    userId,
    own?.lastReadMessageId ?? null,
    own?.clearedUpToMessageId ?? null,
  );
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

/** Уведомления по чату выключаются каждым участником для себя: заглушённый чат перестаёт
 *  присылать пуши о сообщениях, но остаётся в списке и по-прежнему звонит. */
export async function setChatMuted(chatId: string, userId: string, muted: boolean): Promise<boolean> {
  await assertMember(chatId, userId);

  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { mutedAt: muted ? new Date() : null },
  });
  return muted;
}

/** Все пользователи, с которыми у userId есть общий чат — получатели его presence-событий (секция 3). */
export async function getCoMemberIds(userId: string): Promise<string[]> {
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { chatId: true },
  });
  if (memberships.length === 0) return [];

  const coMembers = await prisma.chatMember.findMany({
    where: {
      chatId: { in: memberships.map((m) => m.chatId) },
      userId: { not: userId },
      user: { isService: false },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return coMembers.map((m) => m.userId);
}

export async function getMessages(
  chatId: string,
  userId: string,
  cursor: { before?: number; after?: number },
  limit: number,
): Promise<MessagesPage> {
  await assertMember(chatId, userId);

  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  const idFilter: { gt?: number; lt?: number } = {};
  const floor = Math.max(member.clearedUpToMessageId ?? 0, cursor.after ?? 0);
  if (floor > 0) idFilter.gt = floor;
  if (cursor.before) idFilter.lt = cursor.before;

  const forward = cursor.after !== undefined;

  const rows = await prisma.message.findMany({
    where: { chatId, ...(Object.keys(idFilter).length > 0 ? { id: idFilter } : {}) },
    orderBy: { id: forward ? 'asc' : 'desc' },
    take: limit + 1,
    include: messageInclude,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  if (!forward) page.reverse();
  return { messages: page.map(toMessageDto), hasMore };
}

export async function getMessagesAround(
  chatId: string,
  userId: string,
  messageId: number,
  limit: number,
): Promise<MessagesAround> {
  await assertMember(chatId, userId);

  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  const floor = member.clearedUpToMessageId ?? 0;

  const target = await prisma.message.findFirst({
    where: { chatId, deletedAt: null, id: floor > 0 ? { equals: messageId, gt: floor } : messageId },
    select: { id: true },
  });
  if (!target) throw notFound(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение недоступно');

  const backCount = Math.ceil(limit / 2);
  const forwardCount = limit - backCount;

  const [backRows, forwardRows] = await Promise.all([
    prisma.message.findMany({
      where: { chatId, deletedAt: null, id: floor > 0 ? { lte: messageId, gt: floor } : { lte: messageId } },
      orderBy: { id: 'desc' },
      take: backCount + 1,
      include: messageInclude,
    }),
    prisma.message.findMany({
      where: { chatId, deletedAt: null, id: { gt: messageId } },
      orderBy: { id: 'asc' },
      take: forwardCount + 1,
      include: messageInclude,
    }),
  ]);

  const hasMoreBefore = backRows.length > backCount;
  const hasMoreAfter = forwardRows.length > forwardCount;
  const back = backRows.slice(0, backCount).reverse();
  const forward = forwardRows.slice(0, forwardCount);

  return { messages: [...back, ...forward].map(toMessageDto), hasMoreBefore, hasMoreAfter };
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

export interface DeleteChatResult {
  forEveryone: boolean;
  memberIds: string[];
}

export async function deleteChat(chatId: string, userId: string, forEveryone: boolean): Promise<DeleteChatResult> {
  await assertMember(chatId, userId);

  const chat = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } });
  if (chat.type === 'GROUP') {
    throw badRequest(ErrorCode.VALIDATION_FAILED, 'У группы нет удаления чата — используйте выход из группы');
  }

  const members = await prisma.chatMember.findMany({ where: { chatId }, include: { user: true } });
  const isServiceChat = members.some((m) => m.user.isService);
  if (isServiceChat) throw badRequest(ErrorCode.VALIDATION_FAILED, 'Служебный чат нельзя удалить');

  if (forEveryone) {
    const memberIds = members.map((m) => m.userId);
    await prisma.chat.delete({ where: { id: chatId } });
    return { forEveryone: true, memberIds };
  }

  const lastMessage = await prisma.message.findFirst({
    where: { chatId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { hiddenAt: new Date(), clearedUpToMessageId: lastMessage?.id ?? null },
  });

  return { forEveryone: false, memberIds: [] };
}

export async function dropEmptyPrivateChat(chatId: string, userId: string): Promise<void> {
  await assertMember(chatId, userId);

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Chat" WHERE id = ${chatId} FOR UPDATE`;
    if (locked.length === 0) return;

    const chat = await tx.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: { members: { include: { user: true } }, messages: { select: { id: true }, take: 1 } },
    });
    if (chat.type !== 'PRIVATE') return;
    if (chat.members.some((m) => m.user.isService)) return;
    if (chat.messages.length > 0) return;

    await tx.chat.delete({ where: { id: chatId } });
  });
}
