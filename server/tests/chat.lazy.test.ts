import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { ensureServiceChat } from '../src/services/announcements.js';
import {
  createGroupChat,
  dropEmptyPrivateChat,
  getOrCreatePrivateChat,
  listChats,
} from '../src/services/chat.js';
import { sendMessage } from '../src/services/message.js';
import { search } from '../src/services/search.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string; token: string }> {
  const username = `lazy_${RUN_ID}_${suffix}`;
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
async function post(chatId: string, senderId: string, content: string) {
  messageSeq += 1;
  return sendMessage({ chatId, senderId, clientId: `lazy_${RUN_ID}_${messageSeq}`, content });
}

describe('chat.service.listChats + dropEmptyPrivateChat (R-12)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('пустой приватный чат не виден ни у кого из двоих', async () => {
    const alice = await registerUser('empty_alice');
    const bob = await registerUser('empty_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    expect((await listChats(alice.userId)).some((c) => c.id === chatId)).toBe(false);
    expect((await listChats(bob.userId)).some((c) => c.id === chatId)).toBe(false);
  });

  it('первое сообщение делает чат видимым у обоих', async () => {
    const alice = await registerUser('first_alice');
    const bob = await registerUser('first_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await post(chatId, alice.userId, 'привет');

    expect((await listChats(alice.userId)).some((c) => c.id === chatId)).toBe(true);
    expect((await listChats(bob.userId)).some((c) => c.id === chatId)).toBe(true);
  });

  it('пустая группа остаётся видимой', async () => {
    const owner = await registerUser('grp_owner');
    const member = await registerUser('grp_member');
    const { chatId } = await createGroupChat(owner.userId, 'Пустая группа', [member.username]);
    createdChatIds.push(chatId);

    expect((await listChats(owner.userId)).some((c) => c.id === chatId)).toBe(true);
    expect((await listChats(member.userId)).some((c) => c.id === chatId)).toBe(true);
  });

  it('поиск не показывает пустой приватный чат и не считает собеседника контактом', async () => {
    const alice = await registerUser('search_alice');
    const bob = await registerUser('search_bob');
    await createPrivateChat(alice.userId, bob.username);

    const empty = await search(bob.username, alice.userId);
    expect(empty.chats).toHaveLength(0);
    expect(empty.users.map((u) => u.username)).toContain(bob.username);
    expect(empty.users.find((u) => u.username === bob.username)?.isContact).toBe(false);
  });

  it('поиск показывает чат и контакт, как только в чате есть сообщение', async () => {
    const alice = await registerUser('searchon_alice');
    const bob = await registerUser('searchon_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, alice.userId, 'привет');

    const started = await search(bob.username, alice.userId);
    expect(started.chats.map((c) => c.id)).toContain(chatId);
    const asUser = started.users.find((u) => u.username === bob.username);
    if (asUser) expect(asUser.isContact).toBe(true);
  });

  it('dropEmptyPrivateChat удаляет пустой приватный чат', async () => {
    const alice = await registerUser('drop_alice');
    const bob = await registerUser('drop_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await dropEmptyPrivateChat(chatId, alice.userId);

    expect(await prisma.chat.findUnique({ where: { id: chatId } })).toBeNull();
    createdChatIds.splice(createdChatIds.indexOf(chatId), 1);
  });

  it('dropEmptyPrivateChat не трогает чат, в котором уже есть сообщение', async () => {
    const alice = await registerUser('keep_alice');
    const bob = await registerUser('keep_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, bob.userId, 'успел написать первым');

    await dropEmptyPrivateChat(chatId, alice.userId);

    expect(await prisma.chat.findUnique({ where: { id: chatId } })).not.toBeNull();
    expect((await listChats(alice.userId)).some((c) => c.id === chatId)).toBe(true);
  });

  it('dropEmptyPrivateChat не трогает группу', async () => {
    const owner = await registerUser('grpdrop_owner');
    const member = await registerUser('grpdrop_member');
    const { chatId } = await createGroupChat(owner.userId, 'Не трогать', [member.username]);
    createdChatIds.push(chatId);

    await dropEmptyPrivateChat(chatId, owner.userId);

    expect(await prisma.chat.findUnique({ where: { id: chatId } })).not.toBeNull();
  });

  it('dropEmptyPrivateChat не трогает служебный чат', async () => {
    const user = await registerUser('service_user');
    const service = await ensureServiceChat(user.userId);
    if (!service) throw new Error('Сервисный чат не создан');
    createdChatIds.push(service.chatId);

    await dropEmptyPrivateChat(service.chatId, user.userId);

    expect(await prisma.chat.findUnique({ where: { id: service.chatId } })).not.toBeNull();
  });

  it('DELETE /api/chats/:id/if-empty удаляет пустой чат и отдаёт 204', async () => {
    const alice = await registerUser('http_alice');
    const bob = await registerUser('http_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const res = await request.delete(`/api/chats/${chatId}/if-empty`).set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(204);
    expect(await prisma.chat.findUnique({ where: { id: chatId } })).toBeNull();
    createdChatIds.splice(createdChatIds.indexOf(chatId), 1);
  });

  it('DELETE /api/chats/:id/if-empty ничего не делает, если чат уже не пуст', async () => {
    const alice = await registerUser('httpkeep_alice');
    const bob = await registerUser('httpkeep_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await post(chatId, bob.userId, 'первое сообщение');

    const res = await request.delete(`/api/chats/${chatId}/if-empty`).set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(204);
    expect(await prisma.chat.findUnique({ where: { id: chatId } })).not.toBeNull();
  });
});
