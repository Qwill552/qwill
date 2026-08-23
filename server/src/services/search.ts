import type { ChatSearchResult, SearchResultsDto, UserSearchResult } from '@messenger/shared';
import { SEARCH_PAGE_SIZE } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { toAvatarColor } from '../lib/avatarColor.js';
import { fileUrl } from '../lib/fileUrl.js';
import { pairKeyFor } from './chat.js';

const lastMessageInclude = {
  orderBy: { id: 'desc' as const },
  take: 1,
  include: {
    attachments: { include: { file: { select: { mimeType: true } } } },
    call: true,
    announcement: true,
  },
};

type LastMessage = {
  content: string | null;
  deletedAt: Date | null;
  attachments: { peaks: number[]; file: { mimeType: string } }[];
  call: unknown | null;
  announcement: { versionName: string } | null;
};

function previewOf(message: LastMessage | undefined): string | null {
  if (!message) return null;
  if (message.deletedAt) return 'Сообщение удалено';
  if (message.announcement) return `Новое обновление (${message.announcement.versionName})`;
  if (message.call) return 'Звонок';
  if (message.content) return message.content;

  const attachment = message.attachments[0];
  if (!attachment) return null;
  if (attachment.peaks.length > 0 || attachment.file.mimeType.startsWith('audio/')) return 'Голосовое сообщение';
  if (attachment.file.mimeType.startsWith('image/')) return 'Фото';
  if (attachment.file.mimeType.startsWith('video/')) return 'Видео';
  return 'Файл';
}

function normalize(query: string): { needle: string; usernamesOnly: boolean } {
  const usernamesOnly = query.startsWith('@');
  return { needle: (usernamesOnly ? query.slice(1) : query).trim(), usernamesOnly };
}

async function searchChats(needle: string, usernamesOnly: boolean, userId: string): Promise<ChatSearchResult[]> {
  const byMember = {
    some: {
      userId: { not: userId },
      user: usernamesOnly
        ? { username: { contains: needle, mode: 'insensitive' as const } }
        : {
            OR: [
              { displayName: { contains: needle, mode: 'insensitive' as const } },
              { username: { contains: needle, mode: 'insensitive' as const } },
            ],
          },
    },
  };

  const memberships = await prisma.chatMember.findMany({
    where: {
      userId,
      chat: usernamesOnly
        ? { type: 'PRIVATE', members: byMember }
        : {
            OR: [
              { type: 'GROUP', title: { contains: needle, mode: 'insensitive' } },
              { type: 'PRIVATE', members: byMember },
            ],
          },
    },
    include: {
      chat: {
        include: {
          members: { include: { user: true } },
          messages: lastMessageInclude,
        },
      },
    },
    orderBy: { chat: { updatedAt: 'desc' } },
    take: SEARCH_PAGE_SIZE,
  });

  return memberships.map(({ chat }) => {
    const other = chat.type === 'PRIVATE' ? chat.members.find((member) => member.userId !== userId)?.user : undefined;
    return {
      id: chat.id,
      type: chat.type,
      title: chat.type === 'GROUP' ? (chat.title ?? 'Группа') : (other?.displayName ?? 'Пользователь'),
      avatarUrl: chat.type === 'GROUP' ? fileUrl(chat.avatarFileId) : fileUrl(other?.avatarFileId ?? null),
      avatarColor: other ? toAvatarColor(other.avatarColor) : null,
      lastMessagePreview: previewOf(chat.messages[0]),
      isService: other?.isService ?? false,
    };
  });
}

async function searchUsers(
  needle: string,
  usernamesOnly: boolean,
  userId: string,
  excludeIds: Set<string>,
): Promise<UserSearchResult[]> {
  const candidates = await prisma.user.findMany({
    where: {
      id: { not: userId, notIn: [...excludeIds] },
      isService: false,
      ...(usernamesOnly
        ? { username: { contains: needle, mode: 'insensitive' } }
        : {
            OR: [
              { username: { contains: needle, mode: 'insensitive' } },
              { displayName: { contains: needle, mode: 'insensitive' } },
            ],
          }),
    },
    orderBy: { displayName: 'asc' },
    take: SEARCH_PAGE_SIZE,
  });
  if (candidates.length === 0) return [];

  const existingChats = await prisma.chat.findMany({
    where: { type: 'PRIVATE', pairKey: { in: candidates.map((candidate) => pairKeyFor(userId, candidate.id)) } },
    select: { pairKey: true },
  });
  const existingPairKeys = new Set(existingChats.map((chat) => chat.pairKey));

  return candidates.map((candidate) => ({
    id: candidate.id,
    username: candidate.username,
    displayName: candidate.displayName,
    avatarUrl: fileUrl(candidate.avatarFileId),
    avatarColor: toAvatarColor(candidate.avatarColor),
    lastSeenAt: candidate.lastSeenAt.toISOString(),
    isContact: existingPairKeys.has(pairKeyFor(userId, candidate.id)),
  }));
}

export async function search(query: string, userId: string): Promise<SearchResultsDto> {
  const { needle, usernamesOnly } = normalize(query);
  if (needle.length === 0) return { chats: [], users: [] };

  const chats = await searchChats(needle, usernamesOnly, userId);

  const alreadyShown = new Set<string>();
  for (const membership of await prisma.chatMember.findMany({
    where: { chatId: { in: chats.filter((chat) => chat.type === 'PRIVATE').map((chat) => chat.id) } },
    select: { userId: true },
  })) {
    if (membership.userId !== userId) alreadyShown.add(membership.userId);
  }

  const users = await searchUsers(needle, usernamesOnly, userId, alreadyShown);
  return { chats, users };
}
