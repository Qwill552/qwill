import type { GroupMemberDTO, UpdateRoleDTO } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { toAvatarColor } from '../lib/avatarColor.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { fileUrl } from '../lib/fileUrl.js';
import { assertMember } from './chat.js';
import { ChatRole } from '../generated/prisma/client.js';
import type { Chat, ChatMember, User } from '../generated/prisma/client.js';

function toGroupMemberDto(member: ChatMember & { user: User }): GroupMemberDTO {
  return {
    userId: member.userId,
    username: member.user.username,
    displayName: member.user.displayName,
    avatarUrl: fileUrl(member.user.avatarFileId),
    avatarColor: toAvatarColor(member.user.avatarColor),
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
  };
}

/** Управление участниками имеет смысл только для GROUP — у PRIVATE ровно 2 участника, зафиксированных pairKey. */
async function getGroupChatOrThrow(chatId: string): Promise<Chat> {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound(ErrorCode.CHAT_NOT_FOUND, 'Чат не найден');
  if (chat.type !== 'GROUP') throw forbidden('Операция доступна только для групп');
  return chat;
}

async function getMemberOrThrow(chatId: string, userId: string): Promise<ChatMember> {
  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
  if (!member) throw forbidden('Пользователь не состоит в этой группе', ErrorCode.NOT_A_MEMBER);
  return member;
}

function assertCanManageMembers(role: ChatRole): void {
  if (role !== ChatRole.OWNER && role !== ChatRole.ADMIN) {
    throw forbidden('Только владелец или администратор может управлять участниками');
  }
}

export async function getMembers(chatId: string, requesterId: string): Promise<GroupMemberDTO[]> {
  await assertMember(chatId, requesterId);

  const members = await prisma.chatMember.findMany({
    where: { chatId },
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
  });
  return members.map(toGroupMemberDto);
}

/** Целевой пользователь передаётся @username — поиска по /users/search в этапе 7 ещё нет (секция 7). */
export async function addMember(chatId: string, username: string, requesterId: string): Promise<GroupMemberDTO> {
  await assertMember(chatId, requesterId);
  await getGroupChatOrThrow(chatId);

  const requester = await getMemberOrThrow(chatId, requesterId);
  assertCanManageMembers(requester.role);

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.isService) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');

  const alreadyMember = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: user.id } },
  });
  if (alreadyMember) throw conflict(ErrorCode.ALREADY_MEMBER, 'Пользователь уже состоит в группе');

  const member = await prisma.chatMember.create({
    data: { chatId, userId: user.id, role: ChatRole.MEMBER },
    include: { user: true },
  });
  return toGroupMemberDto(member);
}

export async function removeMember(chatId: string, targetUserId: string, requesterId: string): Promise<void> {
  await assertMember(chatId, requesterId);
  await getGroupChatOrThrow(chatId);

  const target = await getMemberOrThrow(chatId, targetUserId);

  if (requesterId !== targetUserId) {
    const requester = await getMemberOrThrow(chatId, requesterId);
    assertCanManageMembers(requester.role);
  }

  if (target.role === ChatRole.OWNER) {
    const memberCount = await prisma.chatMember.count({ where: { chatId } });
    if (memberCount > 1) {
      throw conflict(ErrorCode.CANNOT_REMOVE_OWNER, 'Нельзя удалить владельца, пока в группе есть другие участники');
    }
  }

  await prisma.chatMember.delete({ where: { chatId_userId: { chatId, userId: targetUserId } } });
}

export async function updateMemberRole(
  chatId: string,
  targetUserId: string,
  newRole: UpdateRoleDTO['role'],
  requesterId: string,
): Promise<GroupMemberDTO> {
  await assertMember(chatId, requesterId);
  await getGroupChatOrThrow(chatId);

  const requester = await getMemberOrThrow(chatId, requesterId);
  if (requester.role !== ChatRole.OWNER) {
    throw forbidden('Только владелец может менять роли участников');
  }

  await getMemberOrThrow(chatId, targetUserId);

  if (targetUserId === requesterId) {
    const ownerCount = await prisma.chatMember.count({ where: { chatId, role: ChatRole.OWNER } });
    if (ownerCount <= 1) {
      throw forbidden('Единственный владелец не может понизить себя — сначала передайте владение');
    }
  }

  const updated = await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId: targetUserId } },
    data: { role: newRole },
    include: { user: true },
  });
  return toGroupMemberDto(updated);
}

/** Возвращает обоих затронутых участников — старого и нового владельца — для последующего broadcast. */
export async function transferOwnership(
  chatId: string,
  newOwnerUsername: string,
  requesterId: string,
): Promise<GroupMemberDTO[]> {
  await assertMember(chatId, requesterId);
  await getGroupChatOrThrow(chatId);

  const requester = await getMemberOrThrow(chatId, requesterId);
  if (requester.role !== ChatRole.OWNER) {
    throw forbidden('Только владелец может передать права владельца');
  }

  const newOwnerUser = await prisma.user.findUnique({ where: { username: newOwnerUsername } });
  if (!newOwnerUser) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');
  const newOwnerId = newOwnerUser.id;
  await getMemberOrThrow(chatId, newOwnerId);

  const [formerOwner, newOwner] = await prisma.$transaction([
    prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: requesterId } },
      data: { role: ChatRole.ADMIN },
      include: { user: true },
    }),
    prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: newOwnerId } },
      data: { role: ChatRole.OWNER },
      include: { user: true },
    }),
  ]);

  return [toGroupMemberDto(formerOwner), toGroupMemberDto(newOwner)];
}

/** Если уходит единственный OWNER — старейший ADMIN (или, если админов нет, старейший MEMBER) становится новым OWNER.
 *  Если участников не остаётся — чат удаляется целиком (каскадом уйдут сообщения). */
export async function leaveGroup(chatId: string, userId: string): Promise<void> {
  await assertMember(chatId, userId);
  const member = await getMemberOrThrow(chatId, userId);

  const others = await prisma.chatMember.findMany({
    where: { chatId, userId: { not: userId } },
    orderBy: { joinedAt: 'asc' },
  });

  if (others.length === 0) {
    await prisma.chat.delete({ where: { id: chatId } });
    return;
  }

  if (member.role === ChatRole.OWNER) {
    const successor = others.find((m) => m.role === ChatRole.ADMIN) ?? others[0]!;
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: successor.userId } },
      data: { role: ChatRole.OWNER },
    });
  }

  await prisma.chatMember.delete({ where: { chatId_userId: { chatId, userId } } });
}
