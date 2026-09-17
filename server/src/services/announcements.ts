import { randomBytes } from 'node:crypto';

import type { MessageDto } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { hashPassword } from '../lib/password.js';
import { logger } from '../lib/logger.js';
import { pairKeyFor } from './chat.js';
import { sendMessage } from './message.js';
import type { User } from '../generated/prisma/client.js';

/** Точка в имени запрещена USERNAME_PATTERN, поэтому это имя не может занять живой человек —
 *  и наоборот, уже занятое кем-то `qwill` сервисному аккаунту не мешает. Наружу имя не
 *  показывается: у сервисного чата нет ни профиля, ни строки с @username. */
export const SERVICE_USERNAME = 'qwill.service';
const SERVICE_DISPLAY_NAME = 'Qwill';

const WELCOME_TEXT =
  'Привет! Это официальный чат Qwill. Сюда будут приходить объявления о новых версиях приложения — ' +
  'что изменилось и что для этого сделать.';

/** Пароль сервисного аккаунта не знает никто: он генерируется случайным и сразу забывается —
 *  войти этим аккаунтом нельзя, он существует только чтобы быть автором объявлений. */
async function createServiceUser(): Promise<User> {
  const passwordHash = await hashPassword(randomBytes(48).toString('hex'));

  return prisma.user.create({
    data: {
      username: SERVICE_USERNAME,
      passwordHash,
      displayName: SERVICE_DISPLAY_NAME,
      isService: true,
    },
  });
}

export async function getServiceUser(): Promise<User> {
  const existing = await prisma.user.findFirst({ where: { isService: true } });
  if (existing) return existing;

  try {
    return await createServiceUser();
  } catch {
    return prisma.user.findUniqueOrThrow({ where: { username: SERVICE_USERNAME } });
  }
}

export interface ServiceChatResult {
  chatId: string;
  isNew: boolean;
}

/** Чат с сервисным аккаунтом заводится на выдаче сессии — то есть на регистрации, входе и
 *  обновлении токена, — и вдобавок при первой FCM-подписке. Так он есть у всех и не ждёт
 *  ближайшей рассылки (D-12), а живые сессии подхватывают его без повторного входа.
 *  Уникальный pairKey делает повторный вызов безобидным — второго чата не появится. */
export async function ensureServiceChat(userId: string): Promise<ServiceChatResult | null> {
  const service = await getServiceUser();
  if (service.id === userId) return null;

  const pairKey = pairKeyFor(userId, service.id);
  const existing = await prisma.chat.findUnique({ where: { pairKey } });
  if (existing) return { chatId: existing.id, isNew: false };

  let chatId: string;
  try {
    const chat = await prisma.chat.create({
      data: {
        type: 'PRIVATE',
        pairKey,
        createdById: service.id,
        members: { createMany: { data: [{ userId }, { userId: service.id }] } },
      },
    });
    chatId = chat.id;
  } catch {
    const afterRace = await prisma.chat.findUnique({ where: { pairKey } });
    if (!afterRace) throw new Error('Не удалось создать сервисный чат');
    return { chatId: afterRace.id, isNew: false };
  }

  await sendMessage({
    chatId,
    senderId: service.id,
    clientId: `qwill-welcome:${chatId}`,
    content: WELCOME_TEXT,
    silent: true,
  });

  return { chatId, isNew: true };
}

export interface AnnouncementInput {
  androidVersionCode: number | null;
  androidVersionName: string | null;
  windowsVersionName: string | null;
  changelog: string[];
}

export interface AnnouncementDelivery {
  userId: string;
  chatId: string;
  chatIsNew: boolean;
  message: MessageDto;
}

export interface AnnouncementResult {
  androidVersionName: string | null;
  windowsVersionName: string | null;
  /** Выпуск уже рассылался: доставки в этом запуске — только те, у кого чата тогда не было. */
  alreadyPublished: boolean;
  deliveries: AnnouncementDelivery[];
  failed: number;
}

async function findPublished(input: AnnouncementInput) {
  if (input.androidVersionCode !== null) {
    const byAndroid = await prisma.announcement.findUnique({
      where: { androidVersionCode: input.androidVersionCode },
    });
    if (byAndroid) return byAndroid;
  }
  if (input.windowsVersionName !== null) {
    const byWindows = await prisma.announcement.findUnique({
      where: { windowsVersionName: input.windowsVersionName },
    });
    if (byWindows) return byWindows;
  }
  return null;
}

async function getOrCreateAnnouncement(input: AnnouncementInput) {
  const existing = await findPublished(input);
  if (existing) return { announcement: existing, alreadyPublished: true };

  try {
    const created = await prisma.announcement.create({
      data: {
        androidVersionCode: input.androidVersionCode,
        androidVersionName: input.androidVersionName,
        windowsVersionName: input.windowsVersionName,
        changelog: input.changelog,
      },
    });
    return { announcement: created, alreadyPublished: false };
  } catch {
    const afterRace = await findPublished(input);
    if (!afterRace) throw new Error('Не удалось создать объявление');
    return { announcement: afterRace, alreadyPublished: true };
  }
}

/** Объявление получают все живые люди, а не владельцы FCM-подписок: список изменений один на
 *  все платформы, а чем человек пользуется, решается уже в пузыре (D-12). Ошибка на одном
 *  получателе не прерывает остальных, а повторный запуск с той же версией ничего не дублирует —
 *  clientId сообщения детерминированный. */
export async function publishAnnouncement(input: AnnouncementInput): Promise<AnnouncementResult> {
  const { announcement, alreadyPublished } = await getOrCreateAnnouncement(input);
  const service = await getServiceUser();

  const recipients = await prisma.user.findMany({
    where: { isService: false, bannedAt: null, id: { not: service.id } },
    select: { id: true },
  });

  const deliveries: AnnouncementDelivery[] = [];
  let failed = 0;

  for (const { id: userId } of recipients) {
    try {
      const chat = await ensureServiceChat(userId);
      if (!chat) continue;
      const { chatId, isNew } = chat;
      const message = await sendMessage({
        chatId,
        senderId: service.id,
        clientId: `qwill-announcement:${announcement.id}:${chatId}`,
        announcementId: announcement.id,
      });
      deliveries.push({ userId, chatId, chatIsNew: isNew, message });
    } catch (error) {
      failed += 1;
      logger.error({ err: error, userId }, 'Не удалось доставить объявление об обновлении');
    }
  }

  return {
    androidVersionName: announcement.androidVersionName,
    windowsVersionName: announcement.windowsVersionName,
    alreadyPublished,
    deliveries,
    failed,
  };
}
