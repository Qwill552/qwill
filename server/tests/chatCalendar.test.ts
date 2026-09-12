import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { firstMessageAtDate, getChatCalendar } from '../src/services/chatCalendar.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { assertFileAccess } from '../src/services/file.js';
import { listChatAttachments } from '../src/services/chatMedia.js';
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
  const username = `cal_${RUN_ID}_${suffix}`;
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

async function postText(chatId: string, senderId: string, at?: string): Promise<number> {
  clientSeq += 1;
  const message = await sendMessage({
    chatId,
    senderId,
    clientId: `cal_${RUN_ID}_${clientSeq}`,
    content: `t${clientSeq}`,
  });
  if (at) await prisma.message.update({ where: { id: message.id }, data: { createdAt: new Date(at) } });
  return message.id;
}

async function postPhoto(
  chatId: string,
  senderId: string,
  at?: string,
  albumId?: string,
): Promise<{ messageId: number; fileId: string }> {
  clientSeq += 1;
  const sha256 = fakeSha256();
  const file = await prisma.file.create({
    data: { sha256, storedName: `cal-${RUN_ID}-${sha256}.bin`, mimeType: 'image/png', size: 10 },
  });
  createdFileIds.push(file.id);
  const message = await sendMessage({
    chatId,
    senderId,
    clientId: `cal_${RUN_ID}_${clientSeq}`,
    attachment: { fileId: file.id, sha256, originalName: 'a' },
    albumId,
  });
  if (at) await prisma.message.update({ where: { id: message.id }, data: { createdAt: new Date(at) } });
  return { messageId: message.id, fileId: file.id };
}

const WIDE = { from: '2024-01-01', to: '2025-12-31' } as const;

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
  await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('chatCalendar.service (R-33A)', () => {
  it('день считается в переданном поясе, а не в UTC', async () => {
    const alice = await registerUser('tz_alice');
    const bob = await registerUser('tz_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, '2025-03-14T22:30:00.000Z');

    const moscow = await getChatCalendar(chatId, alice.userId, { ...WIDE, tz: 'Europe/Moscow', filter: 'all' });
    expect(moscow.days.map((day) => day.date)).toEqual(['2025-03-15']);

    const newYork = await getChatCalendar(chatId, alice.userId, { ...WIDE, tz: 'America/New_York', filter: 'all' });
    expect(newYork.days.map((day) => day.date)).toEqual(['2025-03-14']);

    const kiritimati = await getChatCalendar(chatId, alice.userId, {
      ...WIDE,
      tz: 'Pacific/Kiritimati',
      filter: 'all',
    });
    expect(kiritimati.days.map((day) => day.date)).toEqual(['2025-03-15']);
  });

  it('считает сообщения дня, firstMessageId — самое старое из них', async () => {
    const alice = await registerUser('cnt_alice');
    const bob = await registerUser('cnt_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const first = await postText(chatId, alice.userId, '2025-05-02T08:00:00.000Z');
    await postText(chatId, alice.userId, '2025-05-02T09:00:00.000Z');
    await postText(chatId, alice.userId, '2025-05-03T09:00:00.000Z');

    const calendar = await getChatCalendar(chatId, alice.userId, { ...WIDE, tz: 'Europe/Moscow', filter: 'all' });
    expect(calendar.days).toHaveLength(2);
    expect(calendar.days[0]).toMatchObject({ date: '2025-05-02', count: 2, firstMessageId: first });
    expect(calendar.days[1]).toMatchObject({ date: '2025-05-03', count: 1 });
    expect(calendar.minDate).toBe('2025-05-02');
    expect(calendar.maxDate).toBe('2025-05-03');
  });

  it('удалённое сообщение не считается', async () => {
    const alice = await registerUser('del_alice');
    const bob = await registerUser('del_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, '2025-06-01T10:00:00.000Z');
    const gone = await postText(chatId, alice.userId, '2025-06-01T11:00:00.000Z');
    await prisma.message.update({ where: { id: gone }, data: { deletedAt: new Date() } });

    const calendar = await getChatCalendar(chatId, alice.userId, { ...WIDE, tz: 'Europe/Moscow', filter: 'all' });
    expect(calendar.days).toEqual([expect.objectContaining({ date: '2025-06-01', count: 1 })]);
  });

  it('сообщения ниже clearedUpToMessageId не считаются', async () => {
    const alice = await registerUser('clr_alice');
    const bob = await registerUser('clr_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, '2025-07-01T10:00:00.000Z');
    const cursor = await postText(chatId, alice.userId, '2025-07-02T10:00:00.000Z');
    await postText(chatId, alice.userId, '2025-07-03T10:00:00.000Z');

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: alice.userId } },
      data: { clearedUpToMessageId: cursor },
    });

    const calendar = await getChatCalendar(chatId, alice.userId, { ...WIDE, tz: 'Europe/Moscow', filter: 'all' });
    expect(calendar.days.map((day) => day.date)).toEqual(['2025-07-03']);
    expect(calendar.minDate).toBe('2025-07-03');
  });

  it('filter=media считает вложения и даёт миниатюру дня', async () => {
    const alice = await registerUser('med_alice');
    const bob = await registerUser('med_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, '2025-08-10T10:00:00.000Z');
    const firstPhoto = (await postPhoto(chatId, alice.userId, '2025-08-10T11:00:00.000Z')).messageId;
    await postPhoto(chatId, alice.userId, '2025-08-10T12:00:00.000Z');

    const all = await getChatCalendar(chatId, alice.userId, { ...WIDE, tz: 'Europe/Moscow', filter: 'all' });
    expect(all.days[0]).toMatchObject({ date: '2025-08-10', count: 3 });

    const media = await getChatCalendar(chatId, alice.userId, { ...WIDE, tz: 'Europe/Moscow', filter: 'media' });
    expect(media.days[0]).toMatchObject({ date: '2025-08-10', count: 2, firstMessageId: firstPhoto });
    expect(media.days[0]?.preview?.mimeType).toBe('image/png');
  });

  it('чужой чат календарь не отдаёт', async () => {
    const alice = await registerUser('own_alice');
    const bob = await registerUser('own_bob');
    const eve = await registerUser('own_eve');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await postText(chatId, alice.userId, '2025-09-01T10:00:00.000Z');

    await expect(
      getChatCalendar(chatId, eve.userId, { ...WIDE, tz: 'Europe/Moscow', filter: 'all' }),
    ).rejects.toThrow();

    const forbidden = await request
      .get(`/api/chats/${chatId}/calendar`)
      .query({ tz: 'Europe/Moscow', from: WIDE.from, to: WIDE.to })
      .set('Authorization', `Bearer ${eve.token}`);
    expect(forbidden.status).toBe(403);
  });

  it('неизвестный пояс и слишком широкий диапазон отбиваются валидацией', async () => {
    const alice = await registerUser('val_alice');
    const bob = await registerUser('val_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const badTz = await request
      .get(`/api/chats/${chatId}/calendar`)
      .query({ tz: "Europe/Moscow'; DROP TABLE", from: WIDE.from, to: WIDE.to })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(badTz.status).toBe(400);
    expect(badTz.body.error.code).toBe('VALIDATION_FAILED');

    const tooWide = await request
      .get(`/api/chats/${chatId}/calendar`)
      .query({ tz: 'Europe/Moscow', from: '2000-01-01', to: '2025-01-01' })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(tooWide.status).toBe(400);

    const ok = await request
      .get(`/api/chats/${chatId}/calendar`)
      .query({ tz: 'Europe/Moscow', from: WIDE.from, to: WIDE.to })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.days).toEqual([]);
  });
});

describe('двусторонняя страница вложений (R-33A)', () => {
  it('after отдаёт более новые, границы не врут, страницы не теряют и не дублируют', async () => {
    const alice = await registerUser('pg_alice');
    const bob = await registerUser('pg_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const ids: number[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await postPhoto(chatId, alice.userId)).messageId);

    const newest = await listChatAttachments(chatId, alice.userId, { category: 'media', limit: 2 });
    expect(newest.items.map((item) => item.messageId)).toEqual([ids[4], ids[3]]);
    expect(newest.hasMoreBefore).toBe(true);
    expect(newest.hasMoreAfter).toBe(false);

    const older = await listChatAttachments(chatId, alice.userId, {
      category: 'media',
      limit: 2,
      before: ids[3],
    });
    expect(older.items.map((item) => item.messageId)).toEqual([ids[2], ids[1]]);
    expect(older.hasMoreBefore).toBe(true);
    expect(older.hasMoreAfter).toBe(true);

    const oldest = await listChatAttachments(chatId, alice.userId, {
      category: 'media',
      limit: 2,
      before: ids[1],
    });
    expect(oldest.items.map((item) => item.messageId)).toEqual([ids[0]]);
    expect(oldest.hasMoreBefore).toBe(false);
    expect(oldest.hasMoreAfter).toBe(true);

    const newer = await listChatAttachments(chatId, alice.userId, {
      category: 'media',
      limit: 2,
      after: ids[1],
    });
    expect(newer.items.map((item) => item.messageId)).toEqual([ids[3], ids[2]]);
    expect(newer.hasMoreBefore).toBe(true);
    expect(newer.hasMoreAfter).toBe(true);

    const top = await listChatAttachments(chatId, alice.userId, { category: 'media', limit: 2, after: ids[3] });
    expect(top.items.map((item) => item.messageId)).toEqual([ids[4]]);
    expect(top.hasMoreAfter).toBe(false);
    expect(top.hasMoreBefore).toBe(true);
  });
});

describe('доступ к дедуплицированному файлу (R-33A)', () => {
  it('участник второго чата видит файл, впервые отправленный в первом', async () => {
    const alice = await registerUser('dedup_alice');
    const bob = await registerUser('dedup_bob');
    const carol = await registerUser('dedup_carol');

    const firstChat = await createPrivateChat(alice.userId, bob.username);
    const secondChat = await createPrivateChat(alice.userId, carol.username);

    clientSeq += 1;
    const sha256 = fakeSha256();
    const file = await prisma.file.create({
      data: { sha256, storedName: `cal-${RUN_ID}-${sha256}.bin`, mimeType: 'image/png', size: 10 },
    });
    createdFileIds.push(file.id);

    const inFirst = await sendMessage({
      chatId: firstChat,
      senderId: alice.userId,
      clientId: `cal_${RUN_ID}_dedup_1`,
      attachment: { fileId: file.id, sha256, originalName: 'a' },
    });
    expect(inFirst.id).toBeGreaterThan(0);

    await sendMessage({
      chatId: secondChat,
      senderId: alice.userId,
      clientId: `cal_${RUN_ID}_dedup_2`,
      attachment: { fileId: file.id, sha256, originalName: 'a' },
    });

    await expect(assertFileAccess(file.id, carol.userId)).resolves.toBeUndefined();
    await expect(assertFileAccess(file.id, bob.userId)).resolves.toBeUndefined();
  });

  it('посторонний файл по-прежнему не отдаётся', async () => {
    const alice = await registerUser('dedup_out_alice');
    const bob = await registerUser('dedup_out_bob');
    const eve = await registerUser('dedup_out_eve');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const sha256 = fakeSha256();
    const file = await prisma.file.create({
      data: { sha256, storedName: `cal-${RUN_ID}-${sha256}.bin`, mimeType: 'image/png', size: 10 },
    });
    createdFileIds.push(file.id);
    await sendMessage({
      chatId,
      senderId: alice.userId,
      clientId: `cal_${RUN_ID}_dedup_3`,
      attachment: { fileId: file.id, sha256, originalName: 'a' },
    });

    await expect(assertFileAccess(file.id, eve.userId)).rejects.toThrow();
  });
});

describe('обложка дня (R-33A)', () => {
  it('у альбома обложкой служит его первый снимок, а не последний', async () => {
    const alice = await registerUser('album_alice');
    const bob = await registerUser('album_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postPhoto(chatId, alice.userId, '2025-10-05T09:00:00.000Z');
    const albumId = `alb_${RUN_ID}`;
    const cover = await postPhoto(chatId, alice.userId, '2025-10-05T10:00:00.000Z', albumId);
    await postPhoto(chatId, alice.userId, '2025-10-05T10:00:01.000Z', albumId);
    await postPhoto(chatId, alice.userId, '2025-10-05T10:00:02.000Z', albumId);

    const calendar = await getChatCalendar(chatId, alice.userId, {
      from: '2025-10-01',
      to: '2025-10-31',
      tz: 'Europe/Moscow',
      filter: 'all',
    });

    expect(calendar.days).toHaveLength(1);
    expect(calendar.days[0]?.preview?.id).toBe(cover.fileId);
  });
});

describe('firstMessageAtDate (R-33C)', () => {
  it('день с сообщениями даёт первое сообщение этого дня', async () => {
    const alice = await registerUser('atd_alice');
    const bob = await registerUser('atd_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, '2025-02-10T10:00:00.000Z');
    const first = await postText(chatId, alice.userId, '2025-02-12T08:00:00.000Z');
    await postText(chatId, alice.userId, '2025-02-12T09:00:00.000Z');

    const found = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2025-02-12' });
    expect(found.messageId).toBe(first);
  });

  it('в пустой день берётся первое сообщение не раньше выбранного', async () => {
    const alice = await registerUser('atd_gap_alice');
    const bob = await registerUser('atd_gap_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, '2025-03-01T10:00:00.000Z');
    const after = await postText(chatId, alice.userId, '2025-03-20T10:00:00.000Z');

    const found = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2025-03-10' });
    expect(found.messageId).toBe(after);
  });

  it('дата раньше начала переписки даёт самое старое сообщение', async () => {
    const alice = await registerUser('atd_early_alice');
    const bob = await registerUser('atd_early_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const oldest = await postText(chatId, alice.userId, '2025-04-01T10:00:00.000Z');
    await postText(chatId, alice.userId, '2025-04-02T10:00:00.000Z');

    const found = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2020-01-01' });
    expect(found.messageId).toBe(oldest);
  });

  it('дата позже последнего сообщения даёт самое новое', async () => {
    const alice = await registerUser('atd_late_alice');
    const bob = await registerUser('atd_late_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    await postText(chatId, alice.userId, '2025-05-01T10:00:00.000Z');
    const newest = await postText(chatId, alice.userId, '2025-05-02T10:00:00.000Z');

    const found = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2025-12-31' });
    expect(found.messageId).toBe(newest);
  });

  it('день считается в поясе клиента, как и в календаре', async () => {
    const alice = await registerUser('atd_tz_alice');
    const bob = await registerUser('atd_tz_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const late = await postText(chatId, alice.userId, '2025-06-10T22:30:00.000Z');

    const moscow = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2025-06-11' });
    expect(moscow.messageId).toBe(late);

    const newYork = await firstMessageAtDate(chatId, alice.userId, { tz: 'America/New_York', date: '2025-06-11' });
    expect(newYork.messageId).toBe(late);
    const newYorkSameDay = await firstMessageAtDate(chatId, alice.userId, {
      tz: 'America/New_York',
      date: '2025-06-10',
    });
    expect(newYorkSameDay.messageId).toBe(late);
  });

  it('очищенная и удалённая история не считаются, пустой чат даёт null', async () => {
    const alice = await registerUser('atd_clr_alice');
    const bob = await registerUser('atd_clr_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const empty = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2025-07-01' });
    expect(empty.messageId).toBeNull();

    await postText(chatId, alice.userId, '2025-07-01T10:00:00.000Z');
    const cursor = await postText(chatId, alice.userId, '2025-07-02T10:00:00.000Z');
    const kept = await postText(chatId, alice.userId, '2025-07-03T10:00:00.000Z');
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId: alice.userId } },
      data: { clearedUpToMessageId: cursor },
    });

    const found = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2025-07-01' });
    expect(found.messageId).toBe(kept);

    await prisma.message.update({ where: { id: kept }, data: { deletedAt: new Date() } });
    const gone = await firstMessageAtDate(chatId, alice.userId, { tz: 'Europe/Moscow', date: '2025-07-01' });
    expect(gone.messageId).toBeNull();
  });

  it('чужой чат дату не отдаёт', async () => {
    const alice = await registerUser('atd_own_alice');
    const bob = await registerUser('atd_own_bob');
    const eve = await registerUser('atd_own_eve');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    const only = await postText(chatId, alice.userId, '2025-08-01T10:00:00.000Z');

    await expect(
      firstMessageAtDate(chatId, eve.userId, { tz: 'Europe/Moscow', date: '2025-08-01' }),
    ).rejects.toThrow();

    const forbidden = await request
      .get(`/api/chats/${chatId}/messages/at-date`)
      .query({ tz: 'Europe/Moscow', date: '2025-08-01' })
      .set('Authorization', `Bearer ${eve.token}`);
    expect(forbidden.status).toBe(403);

    const mine = await request
      .get(`/api/chats/${chatId}/messages/at-date`)
      .query({ tz: 'Europe/Moscow', date: '2025-08-01' })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.messageId).toBe(only);

    const badDate = await request
      .get(`/api/chats/${chatId}/messages/at-date`)
      .query({ tz: 'Europe/Moscow', date: '2025-13-45' })
      .set('Authorization', `Bearer ${alice.token}`);
    expect(badDate.status).toBe(400);
  });
});
