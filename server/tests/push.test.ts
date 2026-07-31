import supertest from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webpush from 'web-push';

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

describe('push-уведомления (этап 9)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('POST/DELETE /push/subscribe', () => {
    it('создаёт подписку и удаляет её по endpoint', async () => {
      const { token, userId } = await registerUser('sub');
      const endpoint = `https://push.example.test/${RUN_ID}_sub`;

      const created = await request
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } });
      expect(created.status).toBe(201);

      const stored = await prisma.pushSubscription.findUnique({ where: { endpoint } });
      expect(stored?.userId).toBe(userId);

      const removed = await request
        .delete('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint });
      expect(removed.status).toBe(204);

      expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull();
    });

    it('требует авторизацию', async () => {
      const res = await request
        .post('/api/push/subscribe')
        .send({ endpoint: 'https://push.example.test/anon', keys: { p256dh: 'a', auth: 'b' } });
      expect(res.status).toBe(401);
    });

    it('отклоняет тело без ключей', async () => {
      const { token } = await registerUser('sub_bad');
      const res = await request
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint: 'https://push.example.test/bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('pushService.sendToUser', () => {
    it('шлёт уведомление на каждую подписку пользователя', async () => {
      const { userId } = await registerUser('send');
      const endpoint = `https://push.example.test/${RUN_ID}_send`;
      await prisma.pushSubscription.create({ data: { userId, endpoint, p256dh: 'p', auth: 'a' } });

      vi.mocked(webpush.sendNotification).mockResolvedValueOnce({ statusCode: 201 } as never);

      await pushService.sendToUser(userId, { title: 'Заголовок', body: 'Текст', chatId: 'chat1' });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('удаляет мёртвую подписку при 410 Gone', async () => {
      const { userId } = await registerUser('gone');
      const endpoint = `https://push.example.test/${RUN_ID}_gone`;
      await prisma.pushSubscription.create({ data: { userId, endpoint, p256dh: 'p', auth: 'a' } });

      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));

      await pushService.sendToUser(userId, { title: 'т', body: 'б', chatId: 'chat1' });

      expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull();
    });
  });

  describe('уведомление офлайн-получателя нового сообщения', () => {
    it('sendMessage шлёт push получателю без открытых сокетов (офлайн по умолчанию в тестах)', async () => {
      const sender = await registerUser('msg_sender');
      const recipient = await registerUser('msg_recipient');

      const { chatId } = await getOrCreatePrivateChat(sender.userId, recipient.username);
      createdChatIds.push(chatId);

      const endpoint = `https://push.example.test/${RUN_ID}_msg`;
      await prisma.pushSubscription.create({ data: { userId: recipient.userId, endpoint, p256dh: 'p', auth: 'a' } });

      vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as never);

      await sendMessage({ chatId, senderId: sender.userId, clientId: `${RUN_ID}-msg-1`, content: 'Привет!' });

      // notifyOfflineMembers не awaited изнутри sendMessage (не блокирует ack отправителю) — ждём его фоном.
      await vi.waitFor(() => {
        expect(webpush.sendNotification).toHaveBeenCalled();
      });
    });
  });
});
