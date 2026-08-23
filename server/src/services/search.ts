import type { ChatSearchResult, SearchResultsDto, UserSearchResult } from '@messenger/shared';
import { SEARCH_PAGE_SIZE } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { toAvatarColor } from '../lib/avatarColor.js';
import { fileUrl } from '../lib/fileUrl.js';
import { pairKeyFor } from './chat.js';
import type { Prisma } from '../generated/prisma/client.js';

const PREFIX_MIN_LENGTH = 2;
const insensitive = 'insensitive' as const;

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

interface Query {
  needle: string;
  usernamesOnly: boolean;
  exactOnly: boolean;
}

function parseQuery(raw: string): Query {
  const usernamesOnly = raw.startsWith('@');
  const needle = (usernamesOnly ? raw.slice(1) : raw).trim();
  return { needle, usernamesOnly, exactOnly: needle.length < PREFIX_MIN_LENGTH };
}

function startsWithWord(needle: string): Prisma.StringFilter {
  return { contains: ` ${needle}`, mode: insensitive };
}

function userMatches({ needle, usernamesOnly, exactOnly }: Query): Prisma.UserWhereInput {
  if (exactOnly) {
    const byUsername = { username: { equals: needle, mode: insensitive } };
    if (usernamesOnly) return byUsername;
    return { OR: [byUsername, { displayName: { equals: needle, mode: insensitive } }] };
  }

  const byUsername = { username: { startsWith: needle, mode: insensitive } };
  if (usernamesOnly) return byUsername;
  return {
    OR: [byUsername, { displayName: { startsWith: needle, mode: insensitive } }, { displayName: startsWithWord(needle) }],
  };
}

function titleMatches({ needle, exactOnly }: Query): Prisma.ChatWhereInput {
  if (exactOnly) return { title: { equals: needle, mode: insensitive } };
  return { OR: [{ title: { startsWith: needle, mode: insensitive } }, { title: startsWithWord(needle) }] };
}

function rankOf(candidate: { username: string; displayName: string }, needle: string): number {
  const query = needle.toLowerCase();
  const username = candidate.username.toLowerCase();
  const displayName = candidate.displayName.toLowerCase();

  if (username === query || displayName === query) return 0;
  if (username.startsWith(query)) return 1;
  if (displayName.startsWith(query)) return 2;
  return 3;
}

async function searchChats(query: Query, userId: string): Promise<ChatSearchResult[]> {
  const byOtherMember = { some: { userId: { not: userId }, user: userMatches(query) } };

  const memberships = await prisma.chatMember.findMany({
    where: {
      userId,
      chat: query.usernamesOnly
        ? { type: 'PRIVATE', members: byOtherMember }
        : {
            OR: [
              { type: 'GROUP', ...titleMatches(query) },
              { type: 'PRIVATE', members: byOtherMember },
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

async function searchUsers(query: Query, userId: string, excludeIds: Set<string>): Promise<UserSearchResult[]> {
  const candidates = await prisma.user.findMany({
    where: {
      id: { not: userId, notIn: [...excludeIds] },
      isService: false,
      ...userMatches(query),
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

  return candidates
    .sort((a, b) => {
      const byRank = rankOf(a, query.needle) - rankOf(b, query.needle);
      return byRank !== 0 ? byRank : a.displayName.localeCompare(b.displayName, 'ru');
    })
    .map((candidate) => ({
      id: candidate.id,
      username: candidate.username,
      displayName: candidate.displayName,
      avatarUrl: fileUrl(candidate.avatarFileId),
      avatarColor: toAvatarColor(candidate.avatarColor),
      lastSeenAt: candidate.lastSeenAt.toISOString(),
      isContact: existingPairKeys.has(pairKeyFor(userId, candidate.id)),
    }));
}

export async function search(raw: string, userId: string): Promise<SearchResultsDto> {
  const query = parseQuery(raw);
  if (query.needle.length === 0) return { chats: [], users: [] };

  const chats = await searchChats(query, userId);

  const alreadyShown = new Set<string>();
  for (const membership of await prisma.chatMember.findMany({
    where: { chatId: { in: chats.filter((chat) => chat.type === 'PRIVATE').map((chat) => chat.id) } },
    select: { userId: true },
  })) {
    if (membership.userId !== userId) alreadyShown.add(membership.userId);
  }

  const users = await searchUsers(query, userId, alreadyShown);
  return { chats, users };
}
