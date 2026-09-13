import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

import { getMessaging } from 'firebase-admin/messaging';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { getServiceUser, publishAnnouncement, SERVICE_USERNAME } from '../src/services/announcements.js';
import { setChatMuted } from '../src/services/chat.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdVersionCodes: number[] = [];
/** Своя полка versionCode на прогон: они уникальны в БД, а прогонов в одной dev-базе много. */
const versionCodeBase = 900_000 + (Date.now() % 90_000) * 10;

let serviceUserId = '';
let serviceUsername = '';

async function registerUser(suffix: string): Promise<{ token: string; userId: string; username: string }> {
  const username = `upd3_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: 'Получатель' , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function subscribeFcm(token: string, fcmToken: string): Promise<number> {
  const res = await request
    .post('/api/push/subscribe')
    .set('Authorization', `Bearer ${token}`)
    .send({ provider: 'fcm', token: fcmToken });
  return res.status;
}

function serviceChatsOf(userId: string) {
  return prisma.chat.findMany({
    where: { type: 'PRIVATE', members: { some: { userId } }, AND: { members: { some: { userId: serviceUserId } } } },
    include: { messages: { orderBy: { id: 'asc' }, include: { announcement: true } } },
  });
}

describe('чат Qwill с объявлениями об обновлениях (ОБНОВЛЕНИЯ-3)', () => {
  beforeAll(async () => {
    const service = await getServiceUser();
    serviceUserId = service.id;
    serviceUsername = service.username;
  });

  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { members: { some: { userId: { in: createdUserIds } } } } });
    await prisma.announcement.deleteMany({ where: { versionCode: { in: createdVersionCodes } } });
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('сервисный аккаунт', () => {
    it('заводится один и помечен isService', async () => {
      const again = await getServiceUser();
      expect(again.id).toBe(serviceUserId);
      expect(again.isService).toBe(true);
      expect(again.username).toBe(SERVICE_USERNAME);
      expect(serviceUsername).toBe(SERVICE_USERNAME);
      expect(await prisma.user.count({ where: { isService: true } })).toBe(1);
    });

    it('не находится поиском людей', async () => {
      const { token } = await registerUser('search');
      const res = await request.get('/api/search?q=qwill').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect((res.body.users as { username: string }[]).some((u) => u.username === SERVICE_USERNAME)).toBe(false);
    });

    it('чат с ним нельзя начать вручную по @username', async () => {
      const { token } = await registerUser('manual');
      const res = await request
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: serviceUsername });
      expect(res.status).toBe(404);
    });

    it('его нельзя добавить в группу', async () => {
      const owner = await registerUser('group_owner');
      const member = await registerUser('group_member');
      const created = await request
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Группа', usernames: [member.username] });
      expect(created.status).toBe(201);

      const res = await request
        .post(`/api/chats/${created.body.id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ username: serviceUsername });
      expect(res.status).toBe(404);
    });
  });

  describe('заведение чата при первой FCM-подписке', () => {
    it('подписка fcm заводит чат с приветственным сообщением', async () => {
      const user = await registerUser('fcm_first');
      expect(await subscribeFcm(user.token, `fcm-${RUN_ID}-first`)).toBe(201);

      const chats = await serviceChatsOf(user.userId);
      expect(chats).toHaveLength(1);
      expect(chats[0]!.messages).toHaveLength(1);
      expect(chats[0]!.messages[0]!.senderId).toBe(serviceUserId);
      expect(chats[0]!.messages[0]!.content).toContain('Qwill');
    });

    it('вторая подписка того же человека не заводит второй чат', async () => {
      const user = await registerUser('fcm_twice');
      expect(await subscribeFcm(user.token, `fcm-${RUN_ID}-twice-a`)).toBe(201);
      expect(await subscribeFcm(user.token, `fcm-${RUN_ID}-twice-b`)).toBe(201);

      const chats = await serviceChatsOf(user.userId);
      expect(chats).toHaveLength(1);
      expect(chats[0]!.messages).toHaveLength(1);
    });

    it('подписка webpush не заводит ничего', async () => {
      const user = await registerUser('webpush_only');
      const res = await request
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          provider: 'webpush',
          endpoint: `https://push.example.test/${RUN_ID}_upd3`,
          keys: { p256dh: 'p', auth: 'a' },
        });
      expect(res.status).toBe(201);

      expect(await serviceChatsOf(user.userId)).toHaveLength(0);
    });
  });

  describe('рассылка объявления', () => {
    it('доходит только владельцам FCM-подписок и не дублируется при повторе', async () => {
      const android = await registerUser('publish_fcm');
      const web = await registerUser('publish_web');

      expect(await subscribeFcm(android.token, `fcm-${RUN_ID}-publish`)).toBe(201);
      await prisma.pushSubscription.create({
        data: {
          userId: web.userId,
          provider: 'webpush',
          endpoint: `https://push.example.test/${RUN_ID}_publish`,
          p256dh: 'p',
          auth: 'a',
        },
      });

      const versionCode = versionCodeBase + 1;
      createdVersionCodes.push(versionCode);
      const input = { versionCode, versionName: '9.9.1', changelog: ['стало быстрее', 'починили звук'] };

      const first = await publishAnnouncement(input);
      expect(first.alreadyPublished).toBe(false);
      expect(first.failed).toBe(0);
      expect(first.deliveries.some((d) => d.userId === android.userId)).toBe(true);
      expect(first.deliveries.some((d) => d.userId === web.userId)).toBe(false);

      const androidChats = await serviceChatsOf(android.userId);
      const announcements = androidChats[0]!.messages.filter((m) => m.type === 'ANNOUNCEMENT');
      expect(announcements).toHaveLength(1);
      expect(announcements[0]!.announcement?.versionName).toBe('9.9.1');
      expect(announcements[0]!.announcement?.changelog).toEqual(['стало быстрее', 'починили звук']);

      const second = await publishAnnouncement(input);
      expect(second.alreadyPublished).toBe(true);

      const afterRepeat = await serviceChatsOf(android.userId);
      expect(afterRepeat[0]!.messages.filter((m) => m.type === 'ANNOUNCEMENT')).toHaveLength(1);
      expect(await serviceChatsOf(web.userId)).toHaveLength(0);
    });

    it('заглушённому чату пуш не уходит, незаглушённому уходит', async () => {
      const quiet = await registerUser('muted');
      const loud = await registerUser('loud');

      expect(await subscribeFcm(quiet.token, `fcm-${RUN_ID}-muted`)).toBe(201);
      expect(await subscribeFcm(loud.token, `fcm-${RUN_ID}-loud`)).toBe(201);

      const quietChat = (await serviceChatsOf(quiet.userId))[0]!;
      await setChatMuted(quietChat.id, quiet.userId, true);

      const sendMock = vi.mocked(getMessaging().send);
      sendMock.mockClear();
      sendMock.mockResolvedValue('projects/test/messages/1');

      const versionCode = versionCodeBase + 2;
      createdVersionCodes.push(versionCode);
      await publishAnnouncement({ versionCode, versionName: '9.9.2', changelog: ['тихо'] });

      // notifyOfflineMembers не awaited внутри sendMessage — ждём, пока фоновая рассылка дойдёт
      // до незаглушённого получателя, и только потом проверяем, что заглушённого в ней нет.
      const notifiedTokens = (): string[] => sendMock.mock.calls.map((call) => (call[0] as { token: string }).token);
      await vi.waitFor(() => {
        expect(notifiedTokens()).toContain(`fcm-${RUN_ID}-loud`);
      });
      expect(notifiedTokens()).not.toContain(`fcm-${RUN_ID}-muted`);
    });
  });

  describe('запрет отправки в чат', () => {
    it('сервер отклоняет сообщение от человека и пропускает от сервисного аккаунта', async () => {
      const user = await registerUser('cannot_write');
      expect(await subscribeFcm(user.token, `fcm-${RUN_ID}-write`)).toBe(201);
      const chat = (await serviceChatsOf(user.userId))[0]!;

      await expect(
        sendMessage({ chatId: chat.id, senderId: user.userId, clientId: `${RUN_ID}-write-1`, content: 'Ау?' }),
      ).rejects.toMatchObject({ httpStatus: 403 });

      const fromService = await sendMessage({
        chatId: chat.id,
        senderId: serviceUserId,
        clientId: `${RUN_ID}-write-2`,
        content: 'Служебное',
      });
      expect(fromService.id).toBeGreaterThan(0);
    });

    it('переслать сообщение в этот чат тоже нельзя', async () => {
      const user = await registerUser('cannot_forward');
      const friend = await registerUser('forward_friend');
      expect(await subscribeFcm(user.token, `fcm-${RUN_ID}-forward`)).toBe(201);
      const serviceChat = (await serviceChatsOf(user.userId))[0]!;

      const created = await request
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ username: friend.username });
      expect(created.status).toBe(201);

      const source = await sendMessage({
        chatId: created.body.id as string,
        senderId: user.userId,
        clientId: `${RUN_ID}-forward-src`,
        content: 'Обычное сообщение',
      });

      const { forwardMessages } = await import('../src/services/message.js');
      await expect(
        forwardMessages({
          fromChatId: created.body.id as string,
          toChatId: serviceChat.id,
          userId: user.userId,
          messageIds: [source.id],
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });
  });

  describe('сервисный чат в списке чатов', () => {
    it('отдаётся с пометкой сервисного собеседника и признаком заглушения', async () => {
      const user = await registerUser('list');
      expect(await subscribeFcm(user.token, `fcm-${RUN_ID}-list`)).toBe(201);
      const chat = (await serviceChatsOf(user.userId))[0]!;

      const before = await request.get('/api/chats').set('Authorization', `Bearer ${user.token}`);
      const listed = (before.body.chats as { id: string; muted: boolean; otherMember: { isService: boolean } }[]).find(
        (c) => c.id === chat.id,
      );
      expect(listed?.otherMember.isService).toBe(true);
      expect(listed?.muted).toBe(false);

      const muteRes = await request
        .patch(`/api/chats/${chat.id}/mute`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ muted: true });
      expect(muteRes.status).toBe(200);

      const after = await request.get('/api/chats').set('Authorization', `Bearer ${user.token}`);
      const mutedListed = (after.body.chats as { id: string; muted: boolean }[]).find((c) => c.id === chat.id);
      expect(mutedListed?.muted).toBe(true);
    });
  });
});
