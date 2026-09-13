import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { startCall } from '../src/services/call.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string }> {
  const username = `decline_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: 'password123', displayName: suffix , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username };
}

async function ringingCall(callerSuffix: string, calleeSuffix: string) {
  const caller = await registerUser(callerSuffix);
  const callee = await registerUser(calleeSuffix);
  const { chatId } = await getOrCreatePrivateChat(caller.userId, callee.username);
  createdChatIds.push(chatId);
  const access = await startCall({ chatId, userId: caller.userId, kind: 'AUDIO' });
  return { callee, callId: access.call.id };
}

describe('POST /api/calls/decline — отклонение с заблокированного телефона (шаг ЗВОНКИ-11)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('завершает звонок по FCM-токену устройства, без токена доступа', async () => {
    const { callee, callId } = await ringingCall('ok_a', 'ok_b');
    const fcmToken = `fcm-decline-${RUN_ID}-ok`;
    await prisma.pushSubscription.create({ data: { userId: callee.userId, provider: 'fcm', fcmToken } });

    const res = await request.post('/api/calls/decline').send({ callId, fcmToken });
    expect(res.status).toBe(204);

    const call = await prisma.call.findUnique({ where: { id: callId } });
    expect(call?.status).toBe('DECLINED');
    expect(call?.endedAt).not.toBeNull();
  });

  it('отклоняет неизвестный FCM-токен и не трогает звонок', async () => {
    const { callId } = await ringingCall('bad_a', 'bad_b');

    const res = await request.post('/api/calls/decline').send({ callId, fcmToken: `fcm-unknown-${RUN_ID}` });
    expect(res.status).toBe(401);

    expect((await prisma.call.findUnique({ where: { id: callId } }))?.status).toBe('RINGING');
  });

  it('не даёт отклонить чужой звонок устройством постороннего', async () => {
    const { callId } = await ringingCall('out_a', 'out_b');
    const outsider = await registerUser('out_c');
    const fcmToken = `fcm-decline-${RUN_ID}-out`;
    await prisma.pushSubscription.create({ data: { userId: outsider.userId, provider: 'fcm', fcmToken } });

    const res = await request.post('/api/calls/decline').send({ callId, fcmToken });
    expect(res.status).toBe(403);

    expect((await prisma.call.findUnique({ where: { id: callId } }))?.status).toBe('RINGING');
  });

  it('требует callId в теле', async () => {
    const res = await request.post('/api/calls/decline').send({ fcmToken: 'что-то' });
    expect(res.status).toBe(400);
  });
});
