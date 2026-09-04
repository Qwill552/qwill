import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { deleteChat, getMessagesAround, getOrCreatePrivateChat } from '../src/services/chat.js';
import { deleteMessage, sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string; token: string }> {
  const username = `around_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username, token: res.body.accessToken as string };
}

let messageSeq = 0;
async function post(chatId: string, senderId: string, content: string): Promise<number> {
  messageSeq += 1;
  const message = await sendMessage({ chatId, senderId, clientId: `around_${RUN_ID}_${messageSeq}`, content });
  return message.id;
}

async function chatWithHistory(
  prefix: string,
  count: number,
): Promise<{
  chatId: string;
  ids: number[];
  alice: { userId: string; username: string; token: string };
  bob: { userId: string; username: string; token: string };
}> {
  const alice = await registerUser(`${prefix}_a`);
  const bob = await registerUser(`${prefix}_b`);
  const { chatId } = await getOrCreatePrivateChat(alice.userId, bob.username);
  createdChatIds.push(chatId);

  const ids: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(await post(chatId, i % 2 === 0 ? alice.userId : bob.userId, `сообщение ${i + 1}`));
  }
  return { chatId, ids, alice, bob };
}

describe('chat.service.getMessagesAround (PM-10)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('вокруг сообщения в середине истории — равные половины и оба флага', async () => {
    const { chatId, ids, alice } = await chatWithHistory('middle', 40);
    const target = ids[20]!;

    const window = await getMessagesAround(chatId, alice.userId, target, 10);

    expect(window.messages).toHaveLength(10);
    expect(window.messages.filter((m) => m.id <= target)).toHaveLength(5);
    expect(window.messages.filter((m) => m.id > target)).toHaveLength(5);
    expect(window.messages.some((m) => m.id === target)).toBe(true);
    expect(window.hasMoreBefore).toBe(true);
    expect(window.hasMoreAfter).toBe(true);
    expect([...window.messages].sort((a, b) => a.id - b.id).map((m) => m.id)).toEqual(
      window.messages.map((m) => m.id),
    );
  });

  it('вокруг самого нового — hasMoreAfter false', async () => {
    const { chatId, ids, alice } = await chatWithHistory('newest', 12);

    const window = await getMessagesAround(chatId, alice.userId, ids.at(-1)!, 10);

    expect(window.hasMoreAfter).toBe(false);
    expect(window.hasMoreBefore).toBe(true);
    expect(window.messages.at(-1)!.id).toBe(ids.at(-1));
  });

  it('вокруг самого старого — hasMoreBefore false', async () => {
    const { chatId, ids, alice } = await chatWithHistory('oldest', 12);

    const window = await getMessagesAround(chatId, alice.userId, ids[0]!, 10);

    expect(window.hasMoreBefore).toBe(false);
    expect(window.hasMoreAfter).toBe(true);
    expect(window.messages[0]!.id).toBe(ids[0]);
  });

  it('сообщение ниже очищенной истории недоступно', async () => {
    const { chatId, ids, alice } = await chatWithHistory('cleared', 8);

    await deleteChat(chatId, alice.userId, false);
    await post(chatId, alice.userId, 'после очистки');

    await expect(getMessagesAround(chatId, alice.userId, ids[2]!, 10)).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('удалённое сообщение недоступно', async () => {
    const { chatId, ids, alice } = await chatWithHistory('deleted', 8);

    await deleteMessage({ chatId, messageId: ids[4]!, userId: alice.userId });

    await expect(getMessagesAround(chatId, alice.userId, ids[4]!, 10)).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('удалённое сообщение не попадает и в само окно', async () => {
    const { chatId, ids, alice } = await chatWithHistory('hole', 8);

    await deleteMessage({ chatId, messageId: ids[4]!, userId: alice.userId });
    const window = await getMessagesAround(chatId, alice.userId, ids[3]!, 10);

    expect(window.messages.some((m) => m.id === ids[4])).toBe(false);
  });

  it('чужой чат — отказ', async () => {
    const { chatId, ids } = await chatWithHistory('foreign', 6);
    const stranger = await registerUser('foreign_c');

    await expect(getMessagesAround(chatId, stranger.userId, ids[2]!, 10)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('маршрут отдаёт окно и 404 на несуществующее сообщение', async () => {
    const { chatId, ids, alice } = await chatWithHistory('route', 12);

    const ok = await request
      .get(`/api/chats/${chatId}/messages/around/${ids[5]}?limit=6`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.messages).toHaveLength(6);
    expect(ok.body.hasMoreBefore).toBe(true);
    expect(ok.body.hasMoreAfter).toBe(true);

    const missing = await request
      .get(`/api/chats/${chatId}/messages/around/${ids.at(-1)! + 10_000}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(missing.status).toBe(404);
  });

  it('страница вниз от id идёт по возрастанию и знает, что дальше ещё есть', async () => {
    const { chatId, ids, alice } = await chatWithHistory('after', 20);

    const page = await request
      .get(`/api/chats/${chatId}/messages?after=${ids[4]}&limit=5`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(page.status).toBe(200);
    expect(page.body.messages.map((m: { id: number }) => m.id)).toEqual(ids.slice(5, 10));
    expect(page.body.hasMore).toBe(true);

    const tail = await request
      .get(`/api/chats/${chatId}/messages?after=${ids[14]}&limit=10`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(tail.body.messages.map((m: { id: number }) => m.id)).toEqual(ids.slice(15));
    expect(tail.body.hasMore).toBe(false);
  });
});
