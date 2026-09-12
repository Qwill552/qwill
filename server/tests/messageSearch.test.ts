import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { searchMessagesInChat, sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string; token: string }> {
  const username = `msrch_${RUN_ID}_${suffix}`;
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

let clientSeq = 0;
async function postText(chatId: string, senderId: string, content: string): Promise<number> {
  clientSeq += 1;
  const message = await sendMessage({ chatId, senderId, clientId: `msrch_${RUN_ID}_${clientSeq}`, content });
  return message.id;
}

describe('message.searchMessagesInChat (R-33, R-33B)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('находит своё и чужое, регистр не важен', async () => {
    const alice = await registerUser('own_alice');
    const bob = await registerUser('own_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, 'привет, это ТЕСТ от алисы');
    await postText(chatId, bob.userId, 'а это тест от боба');
    await postText(chatId, alice.userId, 'сообщение без совпадения');

    const result = await searchMessagesInChat(chatId, alice.userId, 'тест', {}, 50);
    expect(result.total).toBe(2);
    expect(result.messages.map((m) => m.content).sort()).toEqual(
      ['а это тест от боба', 'привет, это ТЕСТ от алисы'].sort(),
    );
  });

  it('не находит удалённое сообщение', async () => {
    const alice = await registerUser('del_alice');
    const bob = await registerUser('del_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const messageId = await postText(chatId, alice.userId, 'секретное слово тыква');
    await prisma.message.update({ where: { id: messageId }, data: { content: null, deletedAt: new Date() } });

    const result = await searchMessagesInChat(chatId, alice.userId, 'тыква', {}, 50);
    expect(result.total).toBe(0);
    expect(result.messages).toHaveLength(0);
  });

  it('чужой чат — отказ NOT_A_MEMBER', async () => {
    const alice = await registerUser('frb_alice');
    const bob = await registerUser('frb_bob');
    const eve = await registerUser('frb_eve');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, 'тестовое сообщение');

    await expect(searchMessagesInChat(chatId, eve.userId, 'тест', {}, 50)).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('участник с clearedUpToMessageId не находит сообщения до курсора', async () => {
    const alice = await registerUser('clr_alice');
    const bob = await registerUser('clr_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, 'найди меня тест 1');
    const cursorMessageId = await postText(chatId, alice.userId, 'обычное сообщение курсора');
    await postText(chatId, alice.userId, 'найди меня тест 2');

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: alice.userId } },
      data: { clearedUpToMessageId: cursorMessageId },
    });

    const result = await searchMessagesInChat(chatId, alice.userId, 'тест', {}, 50);
    expect(result.total).toBe(1);
    expect(result.messages[0]?.content).toBe('найди меня тест 2');
  });

  it('пустой запрос отдаёт всю историю чата и верный total (R-33B)', async () => {
    const alice = await registerUser('empty_alice');
    const bob = await registerUser('empty_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    const first = await postText(chatId, alice.userId, 'что угодно');
    const second = await postText(chatId, bob.userId, 'и ещё одно');

    const result = await searchMessagesInChat(chatId, alice.userId, '   ', {}, 50);
    expect(result.total).toBe(2);
    expect(result.messages.map((m) => m.id)).toEqual([second, first]);
    expect(result.hasMore).toBe(false);
  });

  it('совпадение по началу слова: «прив» находит «привет», «ивет» — нет', async () => {
    const alice = await registerUser('pref_alice');
    const bob = await registerUser('pref_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, 'привет, как дела');

    const hit = await searchMessagesInChat(chatId, alice.userId, 'прив', {}, 50);
    expect(hit.total).toBe(1);

    const miss = await searchMessagesInChat(chatId, alice.userId, 'ивет', {}, 50);
    expect(miss.total).toBe(0);
    expect(miss.messages).toHaveLength(0);
  });

  it('совпадение считается с начала любого слова', async () => {
    const alice = await registerUser('word_alice');
    const bob = await registerUser('word_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, 'сегодня звонил Иван Петров');

    expect((await searchMessagesInChat(chatId, alice.userId, 'петров', {}, 50)).total).toBe(1);
    expect((await searchMessagesInChat(chatId, alice.userId, 'етров', {}, 50)).total).toBe(0);
  });

  it('несколько слов — И по началам всех слов', async () => {
    const alice = await registerUser('both_alice');
    const bob = await registerUser('both_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    const both = await postText(chatId, alice.userId, 'привет, увидимся во вторник');
    await postText(chatId, alice.userId, 'привет ещё раз');

    const result = await searchMessagesInChat(chatId, alice.userId, 'прив вторн', {}, 50);
    expect(result.total).toBe(1);
    expect(result.messages.map((m) => m.id)).toEqual([both]);
  });

  it('регистр и ё/е не мешают', async () => {
    const alice = await registerUser('yo_alice');
    const bob = await registerUser('yo_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, 'Ёлка стоит в углу');
    await postText(chatId, alice.userId, 'ежевика поспела');

    expect((await searchMessagesInChat(chatId, alice.userId, 'елка', {}, 50)).total).toBe(1);
    expect((await searchMessagesInChat(chatId, alice.userId, 'ЁЛКА', {}, 50)).total).toBe(1);
  });

  it('fromUserId сужает и выдачу, и total', async () => {
    const alice = await registerUser('from_alice');
    const bob = await registerUser('from_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    const mine = await postText(chatId, alice.userId, 'общее слово от алисы');
    await postText(chatId, bob.userId, 'общее слово от боба');

    const all = await searchMessagesInChat(chatId, alice.userId, 'общее', {}, 50);
    expect(all.total).toBe(2);

    const onlyAlice = await searchMessagesInChat(chatId, alice.userId, 'общее', {}, 50, alice.userId);
    expect(onlyAlice.total).toBe(1);
    expect(onlyAlice.messages.map((m) => m.id)).toEqual([mine]);

    const emptyQueryFrom = await searchMessagesInChat(chatId, alice.userId, '', {}, 50, bob.userId);
    expect(emptyQueryFrom.total).toBe(1);
  });

  it('подпись к фото находится наравне с обычным текстом', async () => {
    const alice = await registerUser('cap_alice');
    const bob = await registerUser('cap_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    const caption = await postText(chatId, alice.userId, 'подпись к снимку: закат');

    const result = await searchMessagesInChat(chatId, alice.userId, 'закат', {}, 50);
    expect(result.messages.map((m) => m.id)).toEqual([caption]);
  });

  it('запрос из одних знаков препинания ничего не находит', async () => {
    const alice = await registerUser('punct_alice');
    const bob = await registerUser('punct_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, 'обычное сообщение');

    const result = await searchMessagesInChat(chatId, alice.userId, '!!! ???', {}, 50);
    expect(result).toEqual({ messages: [], total: 0, hasMore: false });
  });

  it('пагинация: страницы по 2 при пяти совпадениях, hasMore верен на обеих, без дублей и потерь', async () => {
    const alice = await registerUser('pg_alice');
    const bob = await registerUser('pg_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const ids = [
      await postText(chatId, alice.userId, 'слово раз'),
      await postText(chatId, alice.userId, 'слово два'),
      await postText(chatId, alice.userId, 'слово три'),
      await postText(chatId, alice.userId, 'слово четыре'),
      await postText(chatId, alice.userId, 'слово пять'),
    ];

    const firstPage = await searchMessagesInChat(chatId, alice.userId, 'слово', {}, 2);
    expect(firstPage.total).toBe(5);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.messages.map((m) => m.id)).toEqual([ids[4], ids[3]]);

    const secondPage = await searchMessagesInChat(
      chatId,
      alice.userId,
      'слово',
      { before: firstPage.messages[1]!.id },
      2,
    );
    expect(secondPage.total).toBe(5);
    expect(secondPage.hasMore).toBe(true);
    expect(secondPage.messages.map((m) => m.id)).toEqual([ids[2], ids[1]]);

    const thirdPage = await searchMessagesInChat(
      chatId,
      alice.userId,
      'слово',
      { before: secondPage.messages[1]!.id },
      2,
    );
    expect(thirdPage.total).toBe(5);
    expect(thirdPage.hasMore).toBe(false);
    expect(thirdPage.messages.map((m) => m.id)).toEqual([ids[0]]);
  });

  it('GET /api/chats/:id/messages/search работает по HTTP и требует членства', async () => {
    const alice = await registerUser('http_alice');
    const bob = await registerUser('http_bob');
    const eve = await registerUser('http_eve');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, 'найди меня через http');

    const page = await request
      .get(`/api/chats/${chatId}/messages/search`)
      .query({ q: 'http' })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(1);
    expect(page.body.messages).toHaveLength(1);

    const forbidden = await request
      .get(`/api/chats/${chatId}/messages/search`)
      .query({ q: 'http' })
      .set('Authorization', `Bearer ${eve.token}`);
    expect(forbidden.status).toBe(403);
  });
});
