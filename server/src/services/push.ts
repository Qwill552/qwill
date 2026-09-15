import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
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
  logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY не заданы — web push отключён');
}

const fcmConfigured = Boolean(env.FCM_SERVICE_ACCOUNT_JSON);
if (fcmConfigured) {
  try {
    const serviceAccount = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON!);
    if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
  } catch (error) {
    logger.error({ err: error }, 'FCM_SERVICE_ACCOUNT_JSON некорректен — FCM отключён');
  }
} else {
  logger.warn('FCM_SERVICE_ACCOUNT_JSON не задан — FCM отключён');
}
const fcmReady = fcmConfigured && getApps().length > 0;

export type PushSubscriptionInput =
  | { provider: 'webpush'; endpoint: string; p256dh: string; auth: string }
  | { provider: 'fcm'; token: string };

export type PushUnsubscribeTarget = { provider: 'webpush'; endpoint: string } | { provider: 'fcm'; token: string };

/** upsert по endpoint/токену — одно и то же устройство переподписывается с теми же данными (этап 9, секция 10А). */
export async function subscribe(userId: string, sub: PushSubscriptionInput): Promise<void> {
  if (sub.provider === 'fcm') {
    await prisma.pushSubscription.upsert({
      where: { fcmToken: sub.token },
      create: { userId, provider: 'fcm', fcmToken: sub.token },
      update: { userId },
    });
    return;
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, provider: 'webpush', endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
    update: { userId, p256dh: sub.p256dh, auth: sub.auth },
  });
}

export async function unsubscribe(userId: string, target: PushUnsubscribeTarget): Promise<void> {
  if (target.provider === 'fcm') {
    await prisma.pushSubscription.deleteMany({ where: { userId, fcmToken: target.token } });
    return;
  }

  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint: target.endpoint } });
}

export interface PushSendOptions {
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

async function sendViaWebPush(
  sub: { id: string; endpoint: string | null; p256dh: string | null; auth: string | null },
  notification: PushNotificationPayload,
  options?: PushSendOptions,
): Promise<void> {
  if (!vapidConfigured || !sub.endpoint || !sub.p256dh || !sub.auth) return;

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
      logger.error({ err: error }, 'Не удалось отправить web push уведомление');
    }
  }
}

function toFcmData(notification: PushNotificationPayload): Record<string, string> {
  const data: Record<string, string> = {
    chatId: notification.chatId,
    kind: notification.kind ?? 'message',
    title: notification.title,
    body: notification.body,
  };
  if (notification.callId) data.callId = notification.callId;
  if (notification.callerName) data.callerName = notification.callerName;
  if (notification.callKind) data.callKind = notification.callKind;
  return data;
}

/** Звонок уходит data-only и с priority high: блок notification система показала бы сама,
 *  не запустив процесс приложения, а обычный приоритет она вправе отложить — к моменту
 *  доставки звонить было бы уже некому (шаг ЗВОНКИ-11). */
async function sendViaFcm(
  sub: { id: string; fcmToken: string | null },
  notification: PushNotificationPayload,
  options?: PushSendOptions,
): Promise<void> {
  if (!fcmReady || !sub.fcmToken) return;

  const isDataOnly =
    notification.kind === 'call' || notification.kind === 'call-ended' || notification.kind === 'read';

  try {
    await getMessaging().send({
      token: sub.fcmToken,
      data: toFcmData(notification),
      ...(isDataOnly ? {} : { notification: { title: notification.title, body: notification.body } }),
      android: {
        priority: isDataOnly ? 'high' : 'normal',
        ...(options?.ttl === undefined ? {} : { ttl: options.ttl * 1000 }),
        ...(isDataOnly ? {} : { notification: { tag: notification.chatId } }),
      },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    } else {
      logger.error({ err: error }, 'Не удалось отправить FCM-уведомление');
    }
  }
}

/** Шлёт уведомление на все подписки пользователя, каждую — своим каналом; мёртвые удаляет из БД (этап 9, секция 10А). */
export async function sendToUser(userId: string, notification: PushNotificationPayload, options?: PushSendOptions): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map((sub) =>
      sub.provider === 'fcm' ? sendViaFcm(sub, notification, options) : sendViaWebPush(sub, notification, options),
    ),
  );
}

export async function notifyOfflineMembersOfCall(
  callId: string,
  chatId: string,
  initiatorId: string,
  initiatorName: string,
  kind: CallKind,
): Promise<void> {
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
      sendToUser(
        userId,
        { title, body, chatId, kind: 'call', callId, callerName: initiatorName, callKind: kind },
        { ttl: 45, urgency: 'high' },
      ),
    ),
  );
}

/** Прочтение чата снимает уведомления по нему на **своих же** устройствах: сокет о них не
 *  знает, уведомление уже показано системой (R-38). Своё устройство тоже в списке — оно
 *  гасит то, чего у него нет, зато телефон, на котором чат и открыли, чистится сам. */
export async function notifyChatRead(userId: string, chatId: string): Promise<void> {
  await sendToUser(userId, { title: '', body: '', chatId, kind: 'read' }, { ttl: 300, urgency: 'high' });
}

export async function notifyCallEnded(callId: string, chatId: string, excludeUserId: string): Promise<void> {
  if (!fcmReady) return;

  const members = await prisma.chatMember.findMany({
    where: { chatId, userId: { not: excludeUserId } },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: members.map((m) => m.userId) }, provider: 'fcm' },
    select: { id: true, fcmToken: true },
  });

  await Promise.all(
    subscriptions.map((sub) =>
      sendViaFcm(sub, { title: 'Звонок завершён', body: '', chatId, kind: 'call-ended', callId }, { ttl: 30, urgency: 'high' }),
    ),
  );
}
