import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { countChatAttachments, listChatAttachments, listChatLinks } from '../src/services/chatMedia.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];
const createdFileIds: string[] = [];

let sha256Counter = 0;
function fakeSha256(): string {
  sha256Counter += 1;
  return `${Date.now().toString(16)}${sha256Counter.toString(16)}`.padEnd(64, '0').slice(0, 64);
}

async function registerUser(suffix: string): Promise<{ userId: string; username: string; token: string }> {
  const username = `atm_${RUN_ID}_${suffix}`;
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

async function makeFile(mimeType: string, size = 10): Promise<{ id: string; sha256: string }> {
  const sha256 = fakeSha256();
  const file = await prisma.file.create({
    data: { sha256, storedName: `atm-${RUN_ID}-${sha256}.bin`, mimeType, size },
  });
  createdFileIds.push(file.id);
  return { id: file.id, sha256 };
}

let clientSeq = 0;
async function postAttachment(
  chatId: string,
  senderId: string,
  mimeType: string,
  peaks?: number[],
): Promise<number> {
  clientSeq += 1;
  const file = await makeFile(mimeType);
  const message = await sendMessage({
    chatId,
    senderId,
    clientId: `atm_${RUN_ID}_${clientSeq}`,
    attachment: { fileId: file.id, sha256: file.sha256, originalName: 'a', peaks },
  });
  return message.id;
}

async function postText(chatId: string, senderId: string, content: string): Promise<number> {
  clientSeq += 1;
  const message = await sendMessage({ chatId, senderId, clientId: `atm_${RUN_ID}_${clientSeq}`, content });
  return message.id;
}

const LINK_HOST = '127.0.0.1';

function testLink(path: string): string {
  return `http://${LINK_HOST}/${RUN_ID}/${path}`;
}

describe('chatMedia.service (PM-1)', () => {
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await prisma.linkPreview.deleteMany({ where: { url: { contains: `/${RUN_ID}/` } } });
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('каждая категория ловит своё и не ловит чужое', async () => {
    const alice = await registerUser('cat_alice');
    const bob = await registerUser('cat_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postAttachment(chatId, alice.userId, 'image/png');
    await postAttachment(chatId, alice.userId, 'video/mp4');
    await postAttachment(chatId, alice.userId, 'image/gif');
    await postAttachment(chatId, alice.userId, 'audio/ogg', [0.1, 0.5, 0.2]);
    await postAttachment(chatId, alice.userId, 'audio/mpeg');
    await postAttachment(chatId, alice.userId, 'application/pdf');

    const media = await listChatAttachments(chatId, alice.userId, { category: 'media', limit: 50 });
    expect(media.items.map((i) => i.attachment.file.mimeType).sort()).toEqual(['image/png', 'video/mp4']);

    const gif = await listChatAttachments(chatId, alice.userId, { category: 'gif', limit: 50 });
    expect(gif.items.map((i) => i.attachment.file.mimeType)).toEqual(['image/gif']);

    const voice = await listChatAttachments(chatId, alice.userId, { category: 'voice', limit: 50 });
    expect(voice.items).toHaveLength(1);
    expect(voice.items[0]?.attachment.file.mimeType).toBe('audio/ogg');

    const files = await listChatAttachments(chatId, alice.userId, { category: 'file', limit: 50 });
    expect(files.items.map((i) => i.attachment.file.mimeType).sort()).toEqual(['application/pdf', 'audio/mpeg']);

    const counts = await countChatAttachments(chatId, alice.userId);
    expect(counts).toEqual({ photos: 1, videos: 1, voices: 1, gifs: 1, audios: 1, files: 1, links: 0 });
  });

  it('удалённое сообщение не попадает никуда и не считается', async () => {
    const alice = await registerUser('del_alice');
    const bob = await registerUser('del_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const messageId = await postAttachment(chatId, alice.userId, 'image/png');
    await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });

    const media = await listChatAttachments(chatId, alice.userId, { category: 'media', limit: 50 });
    expect(media.items).toHaveLength(0);

    const counts = await countChatAttachments(chatId, alice.userId);
    expect(counts.photos).toBe(0);
  });

  it('участник с clearedUpToMessageId не видит вложений до курсора — ни в списке, ни в счёте', async () => {
    const alice = await registerUser('clr_alice');
    const bob = await registerUser('clr_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postAttachment(chatId, alice.userId, 'image/png');
    const cursorMessageId = await postAttachment(chatId, alice.userId, 'image/png');
    await postAttachment(chatId, alice.userId, 'image/png');

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: alice.userId } },
      data: { clearedUpToMessageId: cursorMessageId },
    });

    const media = await listChatAttachments(chatId, alice.userId, { category: 'media', limit: 50 });
    expect(media.items).toHaveLength(1);

    const counts = await countChatAttachments(chatId, alice.userId);
    expect(counts.photos).toBe(1);
  });

  it('чужой чат — 403 NOT_A_MEMBER', async () => {
    const alice = await registerUser('frb_alice');
    const bob = await registerUser('frb_bob');
    const eve = await registerUser('frb_eve');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await expect(listChatAttachments(chatId, eve.userId, { category: 'media', limit: 50 })).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    await expect(countChatAttachments(chatId, eve.userId)).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('пагинация: две страницы по 2 при четырёх вложениях, hasMore верен на обеих, без дублей и потерь', async () => {
    const alice = await registerUser('pg_alice');
    const bob = await registerUser('pg_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const ids = [
      await postAttachment(chatId, alice.userId, 'image/png'),
      await postAttachment(chatId, alice.userId, 'image/png'),
      await postAttachment(chatId, alice.userId, 'image/png'),
      await postAttachment(chatId, alice.userId, 'image/png'),
    ];

    const firstPage = await listChatAttachments(chatId, alice.userId, { category: 'media', limit: 2 });
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items.map((i) => i.messageId)).toEqual([ids[3], ids[2]]);

    const secondPage = await listChatAttachments(chatId, alice.userId, {
      category: 'media',
      limit: 2,
      before: firstPage.items[1]!.messageId,
    });
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.items.map((i) => i.messageId)).toEqual([ids[1], ids[0]]);
  });

  it('ссылки: три URL в сообщении дают три элемента, слово http без адреса — ни одного', async () => {
    const alice = await registerUser('lnk_alice');
    const bob = await registerUser('lnk_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, 'тут просто слово http и больше ничего');
    const messageId = await postText(
      chatId,
      alice.userId,
      `раз ${testLink('a')} два ${testLink('b')} три ${testLink('c')}`,
    );

    const page = await listChatLinks(chatId, alice.userId, { limit: 50 });
    expect(page.items.map((item) => item.url)).toEqual([testLink('a'), testLink('b'), testLink('c')]);
    expect(page.items.every((item) => item.messageId === messageId)).toBe(true);
    expect(page.hasMore).toBe(false);

    const counts = await countChatAttachments(chatId, alice.userId);
    expect(counts.links).toBe(3);
  });

  it('ссылки: удалённое сообщение и очищенная история не отдаются', async () => {
    const alice = await registerUser('lnkd_alice');
    const bob = await registerUser('lnkd_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const first = await postText(chatId, alice.userId, testLink('d1'));
    const second = await postText(chatId, alice.userId, testLink('d2'));
    const third = await postText(chatId, alice.userId, testLink('d3'));

    await prisma.message.update({ where: { id: third }, data: { deletedAt: new Date() } });
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: alice.userId } },
      data: { clearedUpToMessageId: first },
    });

    const page = await listChatLinks(chatId, alice.userId, { limit: 50 });
    expect(page.items.map((item) => item.messageId)).toEqual([second]);

    const counts = await countChatAttachments(chatId, alice.userId);
    expect(counts.links).toBe(1);
  });

  it('GET /api/chats/:id/links работает по HTTP и требует членства', async () => {
    const alice = await registerUser('lnkh_alice');
    const bob = await registerUser('lnkh_bob');
    const eve = await registerUser('lnkh_eve');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, `смотри ${testLink('h')}`);

    const page = await request.get(`/api/chats/${chatId}/links`).set('Authorization', `Bearer ${alice.token}`);
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].url).toBe(testLink('h'));

    const forbidden = await request.get(`/api/chats/${chatId}/links`).set('Authorization', `Bearer ${eve.token}`);
    expect(forbidden.status).toBe(403);
  });

  it('GET /api/chats/:id/attachments и /attachments/counts работают по HTTP', async () => {
    const alice = await registerUser('http_alice');
    const bob = await registerUser('http_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postAttachment(chatId, alice.userId, 'image/png');

    const page = await request
      .get(`/api/chats/${chatId}/attachments`)
      .query({ category: 'media' })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(1);

    const counts = await request
      .get(`/api/chats/${chatId}/attachments/counts`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(counts.status).toBe(200);
    expect(counts.body.photos).toBe(1);
  });
});
