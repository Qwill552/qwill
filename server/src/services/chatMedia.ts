import {
  extractLinks,
  type ChatAttachmentCategory,
  type ChatAttachmentCounts,
  type ChatAttachmentDto,
  type ChatAttachmentsPage,
  type ChatAttachmentsQuery,
  type ChatLinkDto,
  type ChatLinksPage,
  type ChatLinksQuery,
} from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { assertMember } from './chat.js';
import { getLinkPreviews } from './linkPreview.js';
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

  const [photos, videos, voices, gifs, audios, files, links] = await Promise.all([
    countWhere(photoWhere),
    countWhere(videoWhere),
    countWhere(voiceWhere),
    countWhere(gifWhere),
    countWhere(audioWhere),
    countWhere(fileWhere),
    countChatLinks(chatId, idFilter),
  ]);

  return { photos, videos, voices, gifs, audios, files, links };
}

const LINK_TEXT_FILTER: Prisma.MessageWhereInput = { content: { contains: 'http' } };
const LINK_SCAN_BATCH = 200;
const LINK_SCAN_MAX_ROUNDS = 10;

function linkMessageWhere(chatId: string, idFilter: { gt?: number; lt?: number }): Prisma.MessageWhereInput {
  return {
    chatId,
    deletedAt: null,
    ...LINK_TEXT_FILTER,
    ...(Object.keys(idFilter).length > 0 ? { id: idFilter } : {}),
  };
}

async function countChatLinks(chatId: string, idFilter: { gt?: number }): Promise<number> {
  const rows = await prisma.message.findMany({
    where: linkMessageWhere(chatId, idFilter),
    select: { content: true },
  });
  return rows.reduce((total, row) => total + extractLinks(row.content ?? '').length, 0);
}

export async function listChatLinks(
  chatId: string,
  userId: string,
  query: ChatLinksQuery,
): Promise<ChatLinksPage> {
  await assertMember(chatId, userId);

  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  const items: ChatLinkDto[] = [];
  let cursor = query.before ?? null;
  let hasMore = false;

  for (let round = 0; round < LINK_SCAN_MAX_ROUNDS; round += 1) {
    const idFilter: { gt?: number; lt?: number } = {};
    if (member.clearedUpToMessageId) idFilter.gt = member.clearedUpToMessageId;
    if (cursor !== null) idFilter.lt = cursor;

    const rows = await prisma.message.findMany({
      where: linkMessageWhere(chatId, idFilter),
      select: { id: true, createdAt: true, content: true },
      orderBy: { id: 'desc' },
      take: LINK_SCAN_BATCH + 1,
    });

    const more = rows.length > LINK_SCAN_BATCH;
    const page = rows.slice(0, LINK_SCAN_BATCH);
    hasMore = more;

    let filled = false;
    for (let position = 0; position < page.length; position += 1) {
      const row = page[position]!;
      cursor = row.id;
      for (const url of extractLinks(row.content ?? '')) {
        items.push({ messageId: row.id, createdAt: row.createdAt.toISOString(), url, preview: null });
      }
      if (items.length >= query.limit) {
        hasMore = more || position < page.length - 1;
        filled = true;
        break;
      }
    }

    if (filled || !more) break;
  }

  const urls = [...new Set(items.map((item) => item.url))];
  if (urls.length > 0) {
    const previews = await getLinkPreviews(urls);
    const byUrl = new Map(previews.map((preview) => [preview.url, preview]));
    for (const item of items) item.preview = byUrl.get(item.url) ?? null;
  }

  return { items, hasMore };
}
