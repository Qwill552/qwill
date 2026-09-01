import { ADMIN_CHAT_ACCESS_SETTING_KEY, ADMIN_TICKET_HEADER } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const PASSWORD = 'password123';
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

interface TestUser {
  token: string;
  userId: string;
  username: string;
}

async function registerUser(suffix: string, displayName: string): Promise<TestUser> {
  const username = `r32g_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: PASSWORD, displayName });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function makeAdmin(user: TestUser): Promise<void> {
  await prisma.user.update({ where: { id: user.userId }, data: { role: 'admin' } });
}

async function adminTicket(user: TestUser): Promise<string> {
  const res = await request
    .post('/api/admin/reauth')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.ticket as string;
}

async function setChatAccess(enabled: boolean): Promise<void> {
  const value = enabled ? 'true' : 'false';
  await prisma.appSetting.upsert({
    where: { key: ADMIN_CHAT_ACCESS_SETTING_KEY },
    create: { key: ADMIN_CHAT_ACCESS_SETTING_KEY, value },
    update: { value },
  });
}

async function makeChatWithHistory(
  alice: TestUser,
  bob: TestUser,
  count: number,
): Promise<{ chatId: string; messageIds: number[] }> {
  const { chatId } = await getOrCreatePrivateChat(alice.userId, bob.username);
  createdChatIds.push(chatId);

  const messageIds: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const sender = index % 2 === 0 ? alice : bob;
    const message = await sendMessage({
      chatId,
      senderId: sender.userId,
      clientId: `${RUN_ID}-${chatId}-${index}`,
      content: `строка ${index}`,
    });
    messageIds.push(message.id);
  }
  return { chatId, messageIds };
}

async function fileReport(
  reporter: TestUser,
  targetUserId: string,
  chatId: string,
  messageId: number,
): Promise<string> {
  const res = await request
    .post('/api/reports')
    .set('Authorization', `Bearer ${reporter.token}`)
    .send({ targetUserId, kind: 'message', targetChatId: chatId, targetMessageId: messageId, comment: 'угрозы' });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('чтение переписки по жалобе (R-32G)', () => {
  beforeAll(async () => {
    await setChatAccess(false);
  });

  afterAll(async () => {
    await prisma.appSetting.deleteMany({ where: { key: ADMIN_CHAT_ACCESS_SETTING_KEY } });
    await prisma.report.deleteMany({ where: { reporterId: { in: createdUserIds } } });
    await prisma.adminAction.deleteMany({ where: { adminId: { in: createdUserIds } } });
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('при выключенном рубильнике чат с открытой жалобой не отдаётся', async () => {
    const admin = await registerUser('offadmin', 'Разборщик');
    await makeAdmin(admin);
    const alice = await registerUser('offalice', 'Маша');
    const bob = await registerUser('offbob', 'Пётр');
    const { chatId, messageIds } = await makeChatWithHistory(alice, bob, 2);
    await fileReport(alice, bob.userId, chatId, messageIds[1]!);

    await setChatAccess(false);
    const ticket = await adminTicket(admin);

    const chat = await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(chat.status).toBe(403);

    const messages = await request
      .get(`/api/admin/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(messages.status).toBe(403);
  });

  it('при включённом рубильнике видна вся история, а не только пожалованное сообщение', async () => {
    const admin = await registerUser('onadmin', 'Разборщик');
    await makeAdmin(admin);
    const alice = await registerUser('onalice', 'Маша');
    const bob = await registerUser('onbob', 'Пётр');
    const { chatId, messageIds } = await makeChatWithHistory(alice, bob, 5);
    await fileReport(alice, bob.userId, chatId, messageIds[4]!);

    await setChatAccess(true);
    const ticket = await adminTicket(admin);

    const chat = await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(chat.status).toBe(200);
    expect(chat.body.reportedMessageIds).toEqual([messageIds[4]]);
    expect(chat.body.members).toHaveLength(2);

    const messages = await request
      .get(`/api/admin/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(messages.status).toBe(200);
    expect(messages.body.messages.map((m: { id: number }) => m.id)).toEqual(messageIds);
  });

  it('чат без жалобы не отдаётся даже при включённом рубильнике', async () => {
    const admin = await registerUser('nrepadmin', 'Разборщик');
    await makeAdmin(admin);
    const alice = await registerUser('nrepalice', 'Маша');
    const bob = await registerUser('nrepbob', 'Пётр');
    const { chatId } = await makeChatWithHistory(alice, bob, 2);

    await setChatAccess(true);
    const ticket = await adminTicket(admin);

    const chat = await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(chat.status).toBe(403);
  });

  it('закрытие жалобы отбирает доступ', async () => {
    const admin = await registerUser('closeadmin', 'Разборщик');
    await makeAdmin(admin);
    const alice = await registerUser('closealice', 'Маша');
    const bob = await registerUser('closebob', 'Пётр');
    const { chatId, messageIds } = await makeChatWithHistory(alice, bob, 2);
    const reportId = await fileReport(alice, bob.userId, chatId, messageIds[1]!);

    await setChatAccess(true);
    const ticket = await adminTicket(admin);

    const before = await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(before.status).toBe(200);

    const close = await request
      .patch(`/api/admin/reports/${reportId}/close`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resolution: 'предупреждение' });
    expect(close.status).toBe(204);

    const after = await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(after.status).toBe(403);

    const messages = await request
      .get(`/api/admin/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    expect(messages.status).toBe(403);
  });

  it('без билета и обычным аккаунтом — отказ', async () => {
    const admin = await registerUser('noticketadmin', 'Разборщик');
    await makeAdmin(admin);
    const alice = await registerUser('noticketalice', 'Маша');
    const bob = await registerUser('noticketbob', 'Пётр');
    const { chatId, messageIds } = await makeChatWithHistory(alice, bob, 2);
    await fileReport(alice, bob.userId, chatId, messageIds[1]!);

    await setChatAccess(true);

    const noTicket = await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(noTicket.status).toBe(403);
    expect(noTicket.body.error.code).toBe('ADMIN_TICKET_REQUIRED');

    const asUser = await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .set(ADMIN_TICKET_HEADER, await adminTicket(admin));
    expect(asUser.status).toBe(403);
  });

  it('чтение не оставляет следов у участников', async () => {
    const admin = await registerUser('traceadmin', 'Разборщик');
    await makeAdmin(admin);
    const alice = await registerUser('tracealice', 'Маша');
    const bob = await registerUser('tracebob', 'Пётр');
    const { chatId, messageIds } = await makeChatWithHistory(alice, bob, 3);
    await fileReport(alice, bob.userId, chatId, messageIds[2]!);

    await setChatAccess(true);
    const ticket = await adminTicket(admin);

    const membersBefore = await prisma.chatMember.findMany({ where: { chatId }, orderBy: { userId: 'asc' } });
    const chatBefore = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } });

    await request
      .get(`/api/admin/chats/${chatId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);
    await request
      .get(`/api/admin/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set(ADMIN_TICKET_HEADER, ticket);

    const membersAfter = await prisma.chatMember.findMany({ where: { chatId }, orderBy: { userId: 'asc' } });
    const chatAfter = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } });

    expect(membersAfter).toHaveLength(2);
    expect(membersAfter.some((member) => member.userId === admin.userId)).toBe(false);
    expect(membersAfter.map((m) => m.lastReadMessageId)).toEqual(membersBefore.map((m) => m.lastReadMessageId));
    expect(chatAfter.updatedAt.getTime()).toBe(chatBefore.updatedAt.getTime());

    const adminChats = await request.get('/api/chats').set('Authorization', `Bearer ${admin.token}`);
    expect(adminChats.status).toBe(200);
    const listed = (adminChats.body.chats as { id: string }[]).map((chat) => chat.id);
    expect(listed).not.toContain(chatId);
  });

  it('каждое открытие пишет строку журнала, подгрузка страниц — нет', async () => {
    const admin = await registerUser('logadmin', 'Разборщик');
    await makeAdmin(admin);
    const alice = await registerUser('logalice', 'Маша');
    const bob = await registerUser('logbob', 'Пётр');
    const { chatId, messageIds } = await makeChatWithHistory(alice, bob, 4);
    const reportId = await fileReport(alice, bob.userId, chatId, messageIds[3]!);

    await setChatAccess(true);
    const ticket = await adminTicket(admin);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const opened = await request
        .get(`/api/admin/chats/${chatId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set(ADMIN_TICKET_HEADER, ticket);
      expect(opened.status).toBe(200);
    }

    for (const before of messageIds) {
      const page = await request
        .get(`/api/admin/chats/${chatId}/messages?before=${before}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set(ADMIN_TICKET_HEADER, ticket);
      expect(page.status).toBe(200);
    }

    const entries = await prisma.adminAction.findMany({
      where: { adminId: admin.userId, action: 'chat.open', targetChatId: chatId },
    });
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.detail).toContain(reportId);
    }
  });
});
