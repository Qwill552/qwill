import { ErrorCode } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { blockStateBetween, blockUser, listBlocked, unblockUser } from '../src/services/block.js';
import { startCall } from '../src/services/call.js';
import { createGroupChat, getChatDetail, getOrCreatePrivateChat, listChats } from '../src/services/chat.js';
import { sendMessage } from '../src/services/message.js';
import { AppError } from '../src/lib/errors.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string; token: string }> {
  const username = `blk_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username, token: res.body.accessToken as string };
}

async function createPrivateChat(userId: string, targetUsername: string): Promise<string> {
  const { chatId } = await getOrCreatePrivateChat(userId, targetUsername);
  createdChatIds.push(chatId);
  return chatId;
}

let messageSeq = 0;
function post(chatId: string, senderId: string, content: string) {
  messageSeq += 1;
  return sendMessage({ chatId, senderId, clientId: `blk_${RUN_ID}_${messageSeq}`, content });
}

async function expectBlockedError(action: Promise<unknown>): Promise<void> {
  const error = await action.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(ErrorCode.BLOCKED);
}

describe('block.service (R-32)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('блокировка направленная: у каждой стороны своё состояние', async () => {
    const alice = await registerUser('state_a');
    const bob = await registerUser('state_b');

    expect(await blockStateBetween(alice.userId, bob.userId)).toEqual({ iBlocked: false, blockedMe: false });

    await blockUser(alice.userId, bob.userId);

    expect(await blockStateBetween(alice.userId, bob.userId)).toEqual({ iBlocked: true, blockedMe: false });
    expect(await blockStateBetween(bob.userId, alice.userId)).toEqual({ iBlocked: false, blockedMe: true });
  });

  it('повторная блокировка не ошибка, разблокировка снимает состояние', async () => {
    const alice = await registerUser('twice_a');
    const bob = await registerUser('twice_b');

    await blockUser(alice.userId, bob.userId);
    await blockUser(alice.userId, bob.userId);
    expect(await listBlocked(alice.userId)).toHaveLength(1);

    await unblockUser(alice.userId, bob.userId);
    expect(await blockStateBetween(alice.userId, bob.userId)).toEqual({ iBlocked: false, blockedMe: false });
    expect(await listBlocked(alice.userId)).toHaveLength(0);
  });

  it('себя заблокировать нельзя', async () => {
    const alice = await registerUser('self');
    await expect(blockUser(alice.userId, alice.userId)).rejects.toBeInstanceOf(AppError);
  });

  it('писать не может ни заблокировавший, ни заблокированный', async () => {
    const alice = await registerUser('send_a');
    const bob = await registerUser('send_b');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, alice.userId, 'до блокировки');

    await blockUser(alice.userId, bob.userId);

    await expectBlockedError(post(chatId, alice.userId, 'от заблокировавшего'));
    await expectBlockedError(post(chatId, bob.userId, 'от заблокированного'));

    await unblockUser(alice.userId, bob.userId);
    const message = await post(chatId, bob.userId, 'после разблокировки');
    expect(message.content).toBe('после разблокировки');
  });

  it('история переписки остаётся видна обеим сторонам', async () => {
    const alice = await registerUser('hist_a');
    const bob = await registerUser('hist_b');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, alice.userId, 'первое');
    await post(chatId, bob.userId, 'второе');

    await blockUser(bob.userId, alice.userId);

    const forAlice = await getChatDetail(chatId, alice.userId);
    const forBob = await getChatDetail(chatId, bob.userId);

    expect(forAlice.iBlocked).toBe(false);
    expect(forAlice.blockedMe).toBe(true);
    expect(forBob.iBlocked).toBe(true);
    expect(forBob.blockedMe).toBe(false);
    expect(forAlice.lastMessage?.content).toBe('второе');

    expect((await listChats(alice.userId)).find((c) => c.id === chatId)?.blockedMe).toBe(true);
    expect((await listChats(bob.userId)).find((c) => c.id === chatId)?.iBlocked).toBe(true);
  });

  it('звонок не проходит ни в одну сторону', async () => {
    const alice = await registerUser('call_a');
    const bob = await registerUser('call_b');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, alice.userId, 'привет');

    await blockUser(alice.userId, bob.userId);

    await expectBlockedError(startCall({ chatId, userId: alice.userId, kind: 'AUDIO' }));
    await expectBlockedError(startCall({ chatId, userId: bob.userId, kind: 'AUDIO' }));
  });

  it('группы блокировкой не затронуты', async () => {
    const alice = await registerUser('group_a');
    const bob = await registerUser('group_b');
    const { chatId } = await createGroupChat(alice.userId, 'Группа', [bob.username]);
    createdChatIds.push(chatId);

    await blockUser(alice.userId, bob.userId);

    const message = await post(chatId, bob.userId, 'в группу пишется');
    expect(message.content).toBe('в группу пишется');

    const detail = await getChatDetail(chatId, bob.userId);
    expect(detail.iBlocked).toBe(false);
    expect(detail.blockedMe).toBe(false);
  });

  it('POST и DELETE /api/users/:id/block отдают состояние блокировки', async () => {
    const alice = await registerUser('http_a');
    const bob = await registerUser('http_b');
    await createPrivateChat(alice.userId, bob.username);

    const blockRes = await request
      .post(`/api/users/${bob.userId}/block`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(blockRes.status).toBe(200);
    expect(blockRes.body).toEqual({ iBlocked: true, blockedMe: false });

    const listRes = await request.get('/api/users/me/blocked').set('Authorization', `Bearer ${alice.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(bob.userId);

    const unblockRes = await request
      .delete(`/api/users/${bob.userId}/block`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(unblockRes.status).toBe(200);
    expect(unblockRes.body).toEqual({ iBlocked: false, blockedMe: false });
  });
});
