import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { endCall, getActiveCall, getPendingInvites, joinCall, startCall } from '../src/services/call.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string }> {
  const username = `call_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix , termsVersion: '1.0', privacyVersion: '1.0' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username };
}

async function createPrivateChat(userId: string, targetUsername: string): Promise<string> {
  const { chatId } = await getOrCreatePrivateChat(userId, targetUsername);
  createdChatIds.push(chatId);
  return chatId;
}

function decodeToken(token: string): { sub: string; video: { room: string } } {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
}

describe('call.service (этап ЗВОНКИ-2)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('startCall создаёт звонок в статусе RINGING и выдаёт непустой токен', async () => {
    const a = await registerUser('sc1_a');
    const b = await registerUser('sc1_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const access = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });

    expect(access.call.status).toBe('RINGING');
    expect(access.call.kind).toBe('AUDIO');
    expect(access.token.length).toBeGreaterThan(0);

    const payload = decodeToken(access.token);
    expect(payload.sub).toBe(a.userId);
    expect(payload.video.room).toBe(`call:${access.call.id}`);
  });

  it('повторный startCall в том же чате возвращает тот же callId, а не создаёт второй', async () => {
    const a = await registerUser('sc2_a');
    const b = await registerUser('sc2_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const first = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });
    const second = await startCall({ chatId, userId: b.userId, kind: 'AUDIO' });

    expect(second.call.id).toBe(first.call.id);
    expect(await prisma.call.count({ where: { chatId } })).toBe(1);
  });

  it('startCall от не-участника чата бросает ошибку доступа', async () => {
    const a = await registerUser('sc3_a');
    const b = await registerUser('sc3_b');
    const outsider = await registerUser('sc3_outsider');
    const chatId = await createPrivateChat(a.userId, b.username);

    await expect(startCall({ chatId, userId: outsider.userId, kind: 'AUDIO' })).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('joinCall проставляет joinedAt и выдаёт токен', async () => {
    const a = await registerUser('jc1_a');
    const b = await registerUser('jc1_b');
    const chatId = await createPrivateChat(a.userId, b.username);
    const started = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });

    const access = await joinCall({ callId: started.call.id, userId: b.userId });

    expect(access.token.length).toBeGreaterThan(0);
    const participant = access.call.participants.find((p) => p.user.id === b.userId);
    expect(participant?.joinedAt).not.toBeNull();
  });

  it('joinCall в чужой чат бросает ошибку доступа', async () => {
    const a = await registerUser('jc2_a');
    const b = await registerUser('jc2_b');
    const outsider = await registerUser('jc2_outsider');
    const chatId = await createPrivateChat(a.userId, b.username);
    const started = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });

    await expect(joinCall({ callId: started.call.id, userId: outsider.userId })).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('endCall со статусом ENDED проставляет endedAt', async () => {
    const a = await registerUser('ec1_a');
    const b = await registerUser('ec1_b');
    const chatId = await createPrivateChat(a.userId, b.username);
    const started = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });

    const ended = await endCall({ callId: started.call.id, userId: a.userId, status: 'ENDED' });

    expect(ended.status).toBe('ENDED');
    expect(ended.endedAt).not.toBeNull();
  });

  it('getActiveCall возвращает null после завершения', async () => {
    const a = await registerUser('gac1_a');
    const b = await registerUser('gac1_b');
    const chatId = await createPrivateChat(a.userId, b.username);
    const started = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });
    await endCall({ callId: started.call.id, userId: a.userId, status: 'ENDED' });

    expect(await getActiveCall(chatId, a.userId)).toBeNull();
  });

  it('getPendingInvites видит RINGING-звонок у приглашённого, но не у инициатора', async () => {
    const a = await registerUser('pi1_a');
    const b = await registerUser('pi1_b');
    const chatId = await createPrivateChat(a.userId, b.username);
    const started = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });

    const invitesForB = await getPendingInvites(b.userId);
    const invitesForA = await getPendingInvites(a.userId);

    expect(invitesForB.map((c) => c.id)).toContain(started.call.id);
    expect(invitesForA.map((c) => c.id)).not.toContain(started.call.id);
  });

  it('getPendingInvites пуст после joinCall и после завершения звонка', async () => {
    const a = await registerUser('pi2_a');
    const b = await registerUser('pi2_b');
    const chatId = await createPrivateChat(a.userId, b.username);
    const started = await startCall({ chatId, userId: a.userId, kind: 'AUDIO' });

    await joinCall({ callId: started.call.id, userId: b.userId });
    expect((await getPendingInvites(b.userId)).map((c) => c.id)).not.toContain(started.call.id);

    const c = await registerUser('pi2_c');
    const outsiderChatId = await createPrivateChat(a.userId, c.username);
    const secondCall = await startCall({ chatId: outsiderChatId, userId: a.userId, kind: 'AUDIO' });
    await endCall({ callId: secondCall.call.id, userId: a.userId, status: 'DECLINED' });

    expect((await getPendingInvites(c.userId)).map((call) => call.id)).not.toContain(secondCall.call.id);
  });
});
