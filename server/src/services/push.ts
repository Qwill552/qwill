import webpush from 'web-push';

import type { CallKind, PushNotificationPayload } from '@messenger/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { presenceStore } from '../realtime/presence.js';

const vapidConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
} else {
  logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY не заданы — push-уведомления отключены');
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** upsert по endpoint — один и тот же браузер переподписывается с теми же ключами (этап 9). */
export async function subscribe(userId: string, sub: PushSubscriptionInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
    update: { userId, p256dh: sub.p256dh, auth: sub.auth },
  });
}

export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export interface PushSendOptions {
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

/** Шлёт уведомление на все подписки пользователя; мёртвые (410/404) удаляет из БД (этап 9). */
export async function sendToUser(
  userId: string,
  notification: PushNotificationPayload,
  options?: PushSendOptions,
): Promise<void> {
  if (!vapidConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(notification),
          options ? { TTL: options.ttl, urgency: options.urgency } : undefined,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          logger.error({ err: error, userId }, 'Не удалось отправить push-уведомление');
        }
      }
    }),
  );
}

export async function notifyOfflineMembersOfCall(
  chatId: string,
  initiatorId: string,
  initiatorName: string,
  kind: CallKind,
): Promise<void> {
  if (!vapidConfigured) return;

  const members = await prisma.chatMember.findMany({
    where: { chatId, userId: { not: initiatorId } },
    select: { userId: true },
  });
  const offlineMemberIds = members.map((m) => m.userId).filter((userId) => !presenceStore.hasVisibleClient(userId));
  if (offlineMemberIds.length === 0) return;

  const title = `Входящий звонок от ${initiatorName}`;
  const body = kind === 'VIDEO' ? 'Видеозвонок' : 'Аудиозвонок';

  await Promise.all(
    offlineMemberIds.map((userId) =>
      sendToUser(userId, { title, body, chatId, kind: 'call' }, { ttl: 45, urgency: 'high' }),
    ),
  );
}
