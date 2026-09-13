import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { ensureServiceChat } from '../src/services/announcements.js';
import { createGroupChat, deleteChat, getMessages, getOrCreatePrivateChat, listChats } from '../src/services/chat.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string; token: string }> {
  const username = `del_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix , ...CURRENT_LEGAL_VERSIONS });
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
async function post(chatId: string, senderId: string, content: string) {
  messageSeq += 1;
  return sendMessage({ chatId, senderId, clientId: `del_${RUN_ID}_${messageSeq}`, content });
}

describe('chat.service.deleteChat (R-11)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('forEveryone: false — прячет чат только у меня, история отрезана, собеседник видит всё', async () => {
    const alice = await registerUser('hide_alice');
    const bob = await registerUser('hide_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, alice.userId, 'привет');
    await post(chatId, bob.userId, 'привет-привет');

    const result = await deleteChat(chatId, alice.userId, false);
    expect(result.forEveryone).toBe(false);

    expect((await listChats(alice.userId)).some((c) => c.id === chatId)).toBe(false);
    expect((await listChats(bob.userId)).some((c) => c.id === chatId)).toBe(true);

    const { messages } = await getMessages(chatId, alice.userId, {}, 50);
    expect(messages).toHaveLength(0);

    await post(chatId, bob.userId, 'новое сообщение');

    expect((await listChats(alice.userId)).some((c) => c.id === chatId)).toBe(true);
    const page = await getMessages(chatId, alice.userId, {}, 50);
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.content).toBe('новое сообщение');
  });

  it('DELETE /api/chats/:id?forEveryone=false не удаляет у собеседника', async () => {
    const alice = await registerUser('http_alice');
    const bob = await registerUser('http_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, alice.userId, 'привет');

    const res = await request
      .delete(`/api/chats/${chatId}`)
      .query({ forEveryone: 'false' })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(204);

    expect((await listChats(alice.userId)).some((c) => c.id === chatId)).toBe(false);
    expect((await listChats(bob.userId)).some((c) => c.id === chatId)).toBe(true);
    expect(await prisma.chat.findUnique({ where: { id: chatId } })).not.toBeNull();
  });

  it('forEveryone: true — чат удаляется целиком для обеих сторон', async () => {
    const alice = await registerUser('both_alice');
    const bob = await registerUser('both_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, alice.userId, 'привет');

    const result = await deleteChat(chatId, alice.userId, true);
    expect(result.forEveryone).toBe(true);
    expect(result.memberIds.sort()).toEqual([alice.userId, bob.userId].sort());

    expect(await prisma.chat.findUnique({ where: { id: chatId } })).toBeNull();
    createdChatIds.splice(createdChatIds.indexOf(chatId), 1);
  });

  it('группа — deleteChat отказывает VALIDATION_FAILED', async () => {
    const owner = await registerUser('grp_owner');
    const member = await registerUser('grp_member');
    const { chatId } = await createGroupChat(owner.userId, 'Группа удаления', [member.username]);
    createdChatIds.push(chatId);

    await expect(deleteChat(chatId, owner.userId, false)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('сервисный чат — deleteChat отказывает и с forEveryone: true, и с forEveryone: false', async () => {
    const user = await registerUser('service_user');
    const service = await ensureServiceChat(user.userId);
    if (!service) throw new Error('Сервисный чат не создан');
    createdChatIds.push(service.chatId);

    await expect(deleteChat(service.chatId, user.userId, true)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(deleteChat(service.chatId, user.userId, false)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await listChats(user.userId)).some((c) => c.id === service.chatId)).toBe(true);
  });
});
