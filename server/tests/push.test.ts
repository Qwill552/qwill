import supertest from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
}));

vi.mock('firebase-admin/messaging', () => {
  const messaging = { send: vi.fn() };
  return { getMessaging: vi.fn(() => messaging) };
});

import webpush from 'web-push';
import { getMessaging } from 'firebase-admin/messaging';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { sendMessage } from '../src/services/message.js';
import * as pushService from '../src/services/push.js';

const app = createApp();
const request = supertest(app);

/** Каждый запуск — свой суффикс, чтобы не конфликтовать с прошлыми прогонами в общей dev-БД
 *  (тестовой БД/Docker в этом окружении нет — см. windows-dev-toolchain-constraints). */
const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ token: string; userId: string; username: string }> {
  const username = `stage9_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: 'password123', displayName: 'Пушер' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

describe('push-уведомления (этап 9, секция 10А)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    // Подписка fcm заводит чат с сервисным аккаунтом (ОБНОВЛЕНИЯ-3) — он тоже мусор прогона.
    await prisma.chat.deleteMany({ where: { members: { some: { userId: { in: createdUserIds } } } } });
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('POST/DELETE /push/subscribe — webpush', () => {
    it('создаёт подписку и удаляет её по endpoint', async () => {
      const { token, userId } = await registerUser('sub');
      const endpoint = `https://push.example.test/${RUN_ID}_sub`;

      const created = await request
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'webpush', endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } });
      expect(created.status).toBe(201);

      const stored = await prisma.pushSubscription.findUnique({ where: { endpoint } });
      expect(stored?.userId).toBe(userId);
      expect(stored?.provider).toBe('webpush');

      const removed = await request
        .delete('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'webpush', endpoint });
      expect(removed.status).toBe(204);

      expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull();
    });

    it('требует авторизацию', async () => {
      const res = await request
        .post('/api/push/subscribe')
        .send({ provider: 'webpush', endpoint: 'https://push.example.test/anon', keys: { p256dh: 'a', auth: 'b' } });
      expect(res.status).toBe(401);
    });

    it('отклоняет тело без ключей', async () => {
      const { token } = await registerUser('sub_bad');
      const res = await request
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'webpush', endpoint: 'https://push.example.test/bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST/DELETE /push/subscribe — fcm', () => {
    it('создаёт подписку по токену и удаляет её', async () => {
      const { token, userId } = await registerUser('fcm_sub');
      const fcmToken = `fcm-token-${RUN_ID}`;

      const created = await request
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'fcm', token: fcmToken });
      expect(created.status).toBe(201);

      const stored = await prisma.pushSubscription.findUnique({ where: { fcmToken } });
      expect(stored?.userId).toBe(userId);
      expect(stored?.provider).toBe('fcm');

      const removed = await request
        .delete('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'fcm', token: fcmToken });
      expect(removed.status).toBe(204);

      expect(await prisma.pushSubscription.findUnique({ where: { fcmToken } })).toBeNull();
    });

    it('отклоняет тело без токена', async () => {
      const { token } = await registerUser('fcm_sub_bad');
      const res = await request
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ provider: 'fcm' });
      expect(res.status).toBe(400);
    });
  });

  describe('pushService.sendToUser', () => {
    it('шлёт уведомление на каждую подписку пользователя', async () => {
      const { userId } = await registerUser('send');
      const endpoint = `https://push.example.test/${RUN_ID}_send`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'webpush', endpoint, p256dh: 'p', auth: 'a' } });

      vi.mocked(webpush.sendNotification).mockResolvedValueOnce({ statusCode: 201 } as never);

      await pushService.sendToUser(userId, { title: 'Заголовок', body: 'Текст', chatId: 'chat1' });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('удаляет мёртвую подписку при 410 Gone', async () => {
      const { userId } = await registerUser('gone');
      const endpoint = `https://push.example.test/${RUN_ID}_gone`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'webpush', endpoint, p256dh: 'p', auth: 'a' } });

      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));

      await pushService.sendToUser(userId, { title: 'т', body: 'б', chatId: 'chat1' });

      expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull();
    });

    it('шлёт FCM-подписке через firebase-admin', async () => {
      const { userId } = await registerUser('fcm_send');
      const fcmToken = `fcm-token-${RUN_ID}_send`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'fcm', fcmToken } });

      const sendMock = vi.mocked(getMessaging().send);
      sendMock.mockClear();
      sendMock.mockResolvedValueOnce('projects/test/messages/1');

      await pushService.sendToUser(userId, { title: 'Заголовок', body: 'Текст', chatId: 'chat1' });

      expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ token: fcmToken }));
    });

    it('удаляет FCM-подписку с невалидным токеном', async () => {
      const { userId } = await registerUser('fcm_gone');
      const fcmToken = `fcm-token-${RUN_ID}_gone`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'fcm', fcmToken } });

      const sendMock = vi.mocked(getMessaging().send);
      sendMock.mockClear();
      sendMock.mockRejectedValueOnce(Object.assign(new Error('not registered'), { code: 'messaging/registration-token-not-registered' }));

      await pushService.sendToUser(userId, { title: 'т', body: 'б', chatId: 'chat1' });

      expect(await prisma.pushSubscription.findUnique({ where: { fcmToken } })).toBeNull();
    });

    it('звонок уходит в FCM data-only и с высоким приоритетом', async () => {
      const { userId } = await registerUser('fcm_call');
      const fcmToken = `fcm-token-${RUN_ID}_call`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'fcm', fcmToken } });

      const sendMock = vi.mocked(getMessaging().send);
      sendMock.mockClear();
      sendMock.mockResolvedValueOnce('projects/test/messages/1');

      await pushService.sendToUser(
        userId,
        { title: 'Входящий звонок от Аня', body: 'Аудиозвонок', chatId: 'chat1', kind: 'call', callId: 'call-1', callerName: 'Аня', callKind: 'AUDIO' },
        { ttl: 45, urgency: 'high' },
      );

      const message = sendMock.mock.calls[0]?.[0] as {
        notification?: unknown;
        android?: { priority?: string; ttl?: number };
        data?: Record<string, string>;
      };
      expect(message.notification).toBeUndefined();
      expect(message.android?.priority).toBe('high');
      expect(message.android?.ttl).toBe(45_000);
      expect(message.data).toMatchObject({ kind: 'call', callId: 'call-1', callerName: 'Аня', callKind: 'AUDIO' });
    });

    it('обычное сообщение остаётся notification-пушем с обычным приоритетом', async () => {
      const { userId } = await registerUser('fcm_msg');
      const fcmToken = `fcm-token-${RUN_ID}_msg`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'fcm', fcmToken } });

      const sendMock = vi.mocked(getMessaging().send);
      sendMock.mockClear();
      sendMock.mockResolvedValueOnce('projects/test/messages/1');

      await pushService.sendToUser(userId, { title: 'Аня', body: 'Привет!', chatId: 'chat1' });

      const message = sendMock.mock.calls[0]?.[0] as { notification?: unknown; android?: { priority?: string } };
      expect(message.notification).toMatchObject({ title: 'Аня', body: 'Привет!' });
      expect(message.android?.priority).toBe('normal');
    });

    it('подписчику webpush звонок приходит прежним web-push с urgency high', async () => {
      const { userId } = await registerUser('web_call');
      const endpoint = `https://push.example.test/${RUN_ID}_web_call`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'webpush', endpoint, p256dh: 'p', auth: 'a' } });

      vi.mocked(webpush.sendNotification).mockClear();
      vi.mocked(webpush.sendNotification).mockResolvedValueOnce({ statusCode: 201 } as never);

      await pushService.sendToUser(
        userId,
        { title: 'Входящий звонок от Аня', body: 'Аудиозвонок', chatId: 'chat1', kind: 'call', callId: 'call-1' },
        { ttl: 45, urgency: 'high' },
      );

      expect(webpush.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint }),
        expect.stringContaining('call-1'),
        expect.objectContaining({ urgency: 'high' }),
      );
    });

    it('оба канала работают одновременно для разных устройств одного пользователя', async () => {
      const { userId } = await registerUser('both');
      const endpoint = `https://push.example.test/${RUN_ID}_both`;
      const fcmToken = `fcm-token-${RUN_ID}_both`;
      await prisma.pushSubscription.create({ data: { userId, provider: 'webpush', endpoint, p256dh: 'p', auth: 'a' } });
      await prisma.pushSubscription.create({ data: { userId, provider: 'fcm', fcmToken } });

      vi.mocked(webpush.sendNotification).mockClear();
      vi.mocked(webpush.sendNotification).mockResolvedValueOnce({ statusCode: 201 } as never);
      const sendMock = vi.mocked(getMessaging().send);
      sendMock.mockClear();
      sendMock.mockResolvedValueOnce('projects/test/messages/1');

      await pushService.sendToUser(userId, { title: 'Заголовок', body: 'Текст', chatId: 'chat1' });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('уведомление офлайн-получателя нового сообщения', () => {
    it('sendMessage шлёт push получателю без открытых сокетов (офлайн по умолчанию в тестах)', async () => {
      const sender = await registerUser('msg_sender');
      const recipient = await registerUser('msg_recipient');

      const { chatId } = await getOrCreatePrivateChat(sender.userId, recipient.username);
      createdChatIds.push(chatId);

      const endpoint = `https://push.example.test/${RUN_ID}_msg`;
      await prisma.pushSubscription.create({ data: { userId: recipient.userId, provider: 'webpush', endpoint, p256dh: 'p', auth: 'a' } });

      vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as never);

      await sendMessage({ chatId, senderId: sender.userId, clientId: `${RUN_ID}-msg-1`, content: 'Привет!' });

      // notifyOfflineMembers не awaited изнутри sendMessage (не блокирует ack отправителю) — ждём его фоном.
      await vi.waitFor(() => {
        expect(webpush.sendNotification).toHaveBeenCalled();
      });
    });
  });
});
