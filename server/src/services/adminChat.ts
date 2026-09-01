import {
  ADMIN_CHAT_ACCESS_DISABLED_MESSAGE,
  ADMIN_CHAT_NOT_REPORTED_MESSAGE,
  ErrorCode,
  type AdminChatDto,
  type MessagesPage,
} from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { forbidden, notFound } from '../lib/errors.js';
import { fileUrl } from '../lib/fileUrl.js';
import { assertAdmin, getAdminChatAccessEnabled } from './admin.js';
import { recordAdminAction, type AdminActor } from './adminLog.js';
import { toMemberSummary } from './chat.js';
import { messageInclude, toMessageDto } from './message.js';

interface ReportedChatAccess {
  reportId: string;
  reportedMessageIds: number[];
}

async function assertReportedChat(chatId: string): Promise<ReportedChatAccess> {
  if (!(await getAdminChatAccessEnabled())) {
    throw forbidden(ADMIN_CHAT_ACCESS_DISABLED_MESSAGE);
  }

  const reports = await prisma.report.findMany({
    where: { targetChatId: chatId, status: { not: 'closed' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, targetMessageId: true },
  });
  if (reports.length === 0) throw forbidden(ADMIN_CHAT_NOT_REPORTED_MESSAGE);

  const messageIds = reports
    .map((report) => report.targetMessageId)
    .filter((id): id is number => id !== null);

  return { reportId: reports[0]!.id, reportedMessageIds: [...new Set(messageIds)] };
}

export async function getChatForAdmin(actor: AdminActor, chatId: string): Promise<AdminChatDto> {
  const access = await assertReportedChat(chatId);

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { members: { include: { user: true }, orderBy: { joinedAt: 'asc' } } },
  });
  if (!chat) throw notFound(ErrorCode.CHAT_NOT_FOUND, 'Чат не найден');

  const members = chat.members.map((member) => toMemberSummary(member.user));
  await recordAdminAction(actor, {
    action: 'chat.open',
    targetChatId: chatId,
    detail: { reportId: access.reportId },
  });

  return {
    id: chat.id,
    type: chat.type,
    title: chat.type === 'GROUP' ? (chat.title ?? 'Группа') : members.map((m) => m.displayName).join(' ↔ '),
    avatarUrl: chat.type === 'GROUP' ? fileUrl(chat.avatarFileId) : null,
    members,
    reportId: access.reportId,
    reportedMessageIds: access.reportedMessageIds,
  };
}

export async function getMessagesForAdmin(
  chatId: string,
  before: number | undefined,
  limit: number,
): Promise<MessagesPage> {
  await assertReportedChat(chatId);

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

async function chatIdOfFile(fileId: string): Promise<string | null> {
  const attachment = await prisma.attachment.findFirst({
    where: { OR: [{ fileId }, { thumbnailFileId: fileId }] },
    select: { message: { select: { chatId: true } } },
  });
  if (attachment) return attachment.message.chatId;

  const chat = await prisma.chat.findFirst({ where: { avatarFileId: fileId }, select: { id: true } });
  return chat?.id ?? null;
}

export async function canAdminReadFile(fileId: string, userId: string): Promise<boolean> {
  try {
    await assertAdmin(userId);
    const chatId = await chatIdOfFile(fileId);
    if (!chatId) return false;
    await assertReportedChat(chatId);
    return true;
  } catch {
    return false;
  }
}
