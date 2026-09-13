import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();
const request = supertest(app);
const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

let token = '';
let chatId = '';
let firstMessageId = 0;
let secondMessageId = 0;

async function registerUser(suffix: string): Promise<{ token: string; userId: string }> {
  const res = await request
    .post('/api/auth/register')
    .send({ username: `sync_${RUN_ID}_${suffix}`, password: 'password123', displayName: `Sync ${suffix}` , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

describe('GET /api/chats/:chatId/sync', () => {
  beforeAll(async () => {
    const me = await registerUser('a');
    const other = await registerUser('b');
    token = me.token;

    const chatRes = await request
      .post('/api/chats/private')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: `sync_${RUN_ID}_b` });
    expect(chatRes.status).toBe(201);
    chatId = chatRes.body.id as string;

    const first = await prisma.message.create({
      data: { chatId, senderId: me.userId, content: 'первое', clientId: `sync_${RUN_ID}_1` },
    });
    const second = await prisma.message.create({
      data: { chatId, senderId: other.userId, content: 'второе', clientId: `sync_${RUN_ID}_2` },
    });
    firstMessageId = first.id;
    secondMessageId = second.id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { chatId } });
    await prisma.chat.deleteMany({ where: { id: chatId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('отдаёт всё как created при нулевом курсоре', async () => {
    const res = await request.get(`/api/chats/${chatId}/sync?sinceId=0`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.created.map((m: { id: number }) => m.id)).toEqual([firstMessageId, secondMessageId]);
    expect(res.body.changed).toEqual([]);
    expect(res.body.maxId).toBe(secondMessageId);
  });

  it('правка старого сообщения приходит в changed, а не в created', async () => {
    const before = await request.get(`/api/chats/${chatId}/sync?sinceId=0`).set('Authorization', `Bearer ${token}`);
    const cursor = before.body.maxUpdatedAt as string;

    await prisma.message.update({
      where: { id: firstMessageId },
      data: { content: 'исправленное', editedAt: new Date() },
    });

    const res = await request
      .get(`/api/chats/${chatId}/sync?sinceId=${secondMessageId}&sinceUpdatedAt=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.created).toEqual([]);
    expect(res.body.changed).toHaveLength(1);
    expect(res.body.changed[0].id).toBe(firstMessageId);
    expect(res.body.changed[0].content).toBe('исправленное');
  });

  it('чужому пользователю чат недоступен', async () => {
    const stranger = await registerUser('c');
    const res = await request.get(`/api/chats/${chatId}/sync?sinceId=0`).set('Authorization', `Bearer ${stranger.token}`);

    expect(res.status).toBe(403);
  });
});
