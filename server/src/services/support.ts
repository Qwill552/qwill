import { ErrorCode, SUPPORT_ADMIN_USERNAME, SUPPORT_DAILY_MESSAGE_LIMIT } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { pairKeyFor } from './chat.js';

const SUPPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatMoscow(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', ...options }).format(date);
}

export interface SupportChatResult {
  chatId: string;
  isNew: boolean;
  targetUserId: string;
}

function supportPairKey(userId: string, adminId: string): string {
  return `support:${pairKeyFor(userId, adminId)}`;
}

export async function ensureSupportChat(userId: string): Promise<SupportChatResult> {
  const admin = await prisma.user.findUnique({ where: { username: SUPPORT_ADMIN_USERNAME } });
  if (!admin) throw notFound(ErrorCode.NOT_FOUND, 'Администратор не найден');
  if (admin.id === userId) throw badRequest(ErrorCode.VALIDATION_FAILED, 'Нельзя написать самому себе');

  const pairKey = supportPairKey(userId, admin.id);
  const existing = await prisma.chat.findUnique({ where: { pairKey } });
  if (existing) return { chatId: existing.id, isNew: false, targetUserId: admin.id };

  try {
    const chat = await prisma.chat.create({
      data: {
        type: 'PRIVATE',
        pairKey,
        createdById: userId,
        isSupportRequest: true,
        members: { createMany: { data: [{ userId }, { userId: admin.id }] } },
      },
    });
    return { chatId: chat.id, isNew: true, targetUserId: admin.id };
  } catch {
    const afterRace = await prisma.chat.findUnique({ where: { pairKey } });
    if (afterRace) return { chatId: afterRace.id, isNew: false, targetUserId: admin.id };
    throw new Error('Не удалось создать чат поддержки');
  }
}

export async function incomingSupportMessageAdminId(chatId: string, senderId: string): Promise<string | null> {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { isSupportRequest: true } });
  if (!chat?.isSupportRequest) return null;

  const admin = await prisma.user.findUnique({ where: { username: SUPPORT_ADMIN_USERNAME }, select: { id: true } });
  if (!admin || admin.id === senderId) return null;
  return admin.id;
}

export async function assertSupportSendAllowed(chatId: string, userId: string): Promise<void> {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { isSupportRequest: true } });
  if (!chat?.isSupportRequest) return;

  const admin = await prisma.user.findUnique({
    where: { username: SUPPORT_ADMIN_USERNAME },
    select: { id: true },
  });
  if (admin && admin.id === userId) return;

  const sender = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { supportMutedUntil: true },
  });
  if (sender.supportMutedUntil && sender.supportMutedUntil > new Date()) {
    throw forbidden(
      `Обращения от вас не принимаются до ${formatMoscow(sender.supportMutedUntil, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    );
  }

  const since = new Date(Date.now() - SUPPORT_WINDOW_MS);
  const recent = await prisma.message.findMany({
    where: { chatId, senderId: userId, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (recent.length >= SUPPORT_DAILY_MESSAGE_LIMIT) {
    const nextAt = new Date(recent[0]!.createdAt.getTime() + SUPPORT_WINDOW_MS);
    throw forbidden(
      `Вы уже отправили ${SUPPORT_DAILY_MESSAGE_LIMIT} сообщений за сутки. Следующее можно будет отправить в ${formatMoscow(
        nextAt,
        { hour: '2-digit', minute: '2-digit' },
      )}.`,
    );
  }
}
