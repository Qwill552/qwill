import type {
  ChatAttachmentCategory,
  ChatAttachmentCounts,
  ChatAttachmentDto,
  ChatAttachmentsPage,
  ChatAttachmentsQuery,
} from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { assertMember } from './chat.js';
import { toAttachmentDto } from './message.js';
import type { Prisma } from '../generated/prisma/client.js';

const photoWhere: Prisma.AttachmentWhereInput = {
  peaks: { isEmpty: true },
  file: { mimeType: { startsWith: 'image/' } },
  NOT: { file: { mimeType: 'image/gif' } },
};
const videoWhere: Prisma.AttachmentWhereInput = {
  peaks: { isEmpty: true },
  file: { mimeType: { startsWith: 'video/' } },
};
const gifWhere: Prisma.AttachmentWhereInput = {
  peaks: { isEmpty: true },
  file: { mimeType: 'image/gif' },
};
const voiceWhere: Prisma.AttachmentWhereInput = {
  peaks: { isEmpty: false },
};
const audioWhere: Prisma.AttachmentWhereInput = {
  peaks: { isEmpty: true },
  file: { mimeType: { startsWith: 'audio/' } },
};
const fileWhere: Prisma.AttachmentWhereInput = {
  peaks: { isEmpty: true },
  NOT: [
    { file: { mimeType: { startsWith: 'image/' } } },
    { file: { mimeType: { startsWith: 'video/' } } },
    { file: { mimeType: { startsWith: 'audio/' } } },
  ],
};

const categoryWhereMap: Record<ChatAttachmentCategory, Prisma.AttachmentWhereInput> = {
  media: { OR: [photoWhere, videoWhere] },
  gif: gifWhere,
  voice: voiceWhere,
  file: { OR: [audioWhere, fileWhere] },
};

export async function listChatAttachments(
  chatId: string,
  userId: string,
  query: ChatAttachmentsQuery,
): Promise<ChatAttachmentsPage> {
  await assertMember(chatId, userId);

  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  const idFilter: { gt?: number; lt?: number } = {};
  if (member.clearedUpToMessageId) idFilter.gt = member.clearedUpToMessageId;
  if (query.before) idFilter.lt = query.before;

  const rows = await prisma.attachment.findMany({
    where: {
      ...categoryWhereMap[query.category],
      message: { chatId, deletedAt: null, ...(Object.keys(idFilter).length > 0 ? { id: idFilter } : {}) },
    },
    include: {
      file: true,
      thumbnail: true,
      message: { select: { id: true, createdAt: true, senderId: true } },
    },
    orderBy: { message: { id: 'desc' } },
    take: query.limit + 1,
  });

  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const items: ChatAttachmentDto[] = page.map((row) => ({
    messageId: row.message.id,
    createdAt: row.message.createdAt.toISOString(),
    senderId: row.message.senderId,
    attachment: toAttachmentDto(row),
  }));

  return { items, hasMore };
}

export async function countChatAttachments(chatId: string, userId: string): Promise<ChatAttachmentCounts> {
  await assertMember(chatId, userId);

  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  const idFilter: { gt?: number } = {};
  if (member.clearedUpToMessageId) idFilter.gt = member.clearedUpToMessageId;

  const messageFilter: Prisma.AttachmentWhereInput = {
    message: { chatId, deletedAt: null, ...(Object.keys(idFilter).length > 0 ? { id: idFilter } : {}) },
  };
  const countWhere = (kind: Prisma.AttachmentWhereInput) => prisma.attachment.count({ where: { ...kind, ...messageFilter } });

  const [photos, videos, voices, gifs, audios, files] = await Promise.all([
    countWhere(photoWhere),
    countWhere(videoWhere),
    countWhere(voiceWhere),
    countWhere(gifWhere),
    countWhere(audioWhere),
    countWhere(fileWhere),
  ]);

  return { photos, videos, voices, gifs, audios, files };
}
