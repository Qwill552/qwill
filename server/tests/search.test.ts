import type { ChatSearchResult, SearchResultsDto, UserSearchResult } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

interface TestUser {
  token: string;
  userId: string;
  username: string;
  displayName: string;
}

async function registerUser(suffix: string, name: string): Promise<TestUser> {
  const username = `srch_${RUN_ID}_${suffix}`;
  const displayName = `${name} ${RUN_ID}`;
  const res = await request.post('/api/auth/register').send({ username, password: 'password123', displayName });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username, displayName };
}

async function registerOneLetterUser(suffix: string, displayName: string): Promise<TestUser> {
  const username = `srch_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: 'password123', displayName });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username, displayName };
}

async function startPrivateChat(actor: TestUser, withUser: TestUser): Promise<string> {
  const res = await request
    .post('/api/chats/private')
    .set('Authorization', `Bearer ${actor.token}`)
    .send({ username: withUser.username });
  expect(res.status).toBe(201);
  createdChatIds.push(res.body.id as string);
  return res.body.id as string;
}

let messageSeq = 0;
async function sendFirstMessage(chatId: string, senderId: string): Promise<void> {
  messageSeq += 1;
  await sendMessage({ chatId, senderId, clientId: `srch_${RUN_ID}_${messageSeq}`, content: 'привет' });
}

async function createGroup(actor: TestUser, title: string, usernames: string[]): Promise<string> {
  const res = await request
    .post('/api/chats/group')
    .set('Authorization', `Bearer ${actor.token}`)
    .send({ title, usernames });
  expect(res.status).toBe(201);
  createdChatIds.push(res.body.id as string);
  return res.body.id as string;
}

async function search(actor: TestUser, query: string): Promise<SearchResultsDto> {
  const res = await request
    .get(`/api/search?q=${encodeURIComponent(query)}`)
    .set('Authorization', `Bearer ${actor.token}`);
  expect(res.status).toBe(200);
  return res.body as SearchResultsDto;
}

function chatTitles(results: SearchResultsDto): string[] {
  return results.chats.map((chat: ChatSearchResult) => chat.title);
}

function userIds(results: SearchResultsDto): string[] {
  return results.users.map((user: UserSearchResult) => user.id);
}

describe('GET /api/search (этап 4, R-10)', () => {
  const groupTitle = `Ярмарка ${RUN_ID}`;
  let me: TestUser;
  let known: TestUser;
  let stranger: TestUser;
  let strangerFriend: TestUser;
  let solo: TestUser;
  let strangerChatId: string;

  beforeAll(async () => {
    me = await registerUser('me', 'Искатель');
    known = await registerUser('known', 'Знакомый');
    stranger = await registerUser('stranger', 'Чужой');
    strangerFriend = await registerUser('friend', 'Подруга');
    solo = await registerOneLetterUser('solo', 'ЙЙЙ');

    const knownChatId = await startPrivateChat(me, known);
    await sendFirstMessage(knownChatId, me.userId);
    strangerChatId = await startPrivateChat(stranger, strangerFriend);
    await sendFirstMessage(strangerChatId, stranger.userId);
    await createGroup(me, groupTitle, [known.username]);
  });

  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('чужие приватные чаты в выдачу не попадают', async () => {
    const results = await search(me, RUN_ID);

    expect(results.chats.map((chat: ChatSearchResult) => chat.id)).not.toContain(strangerChatId);
    expect(chatTitles(results)).not.toContain(stranger.displayName);
    expect(chatTitles(results)).not.toContain(strangerFriend.displayName);
  });

  it('находит свой приватный чат по имени собеседника и группу по названию', async () => {
    const results = await search(me, RUN_ID);

    expect(chatTitles(results)).toContain(known.displayName);
    expect(chatTitles(results)).toContain(groupTitle);
  });

  it('находит человека по displayName и не находит себя', async () => {
    const results = await search(me, `Чужой ${RUN_ID}`);

    expect(userIds(results)).toContain(stranger.userId);
    expect(userIds(results)).not.toContain(me.userId);
  });

  it('одна буква ищет только точное совпадение целиком', async () => {
    const exact = await search(me, 'ЙЙЙ');
    expect(userIds(exact)).toContain(solo.userId);

    const single = await search(me, 'ч');
    expect(userIds(single)).not.toContain(stranger.userId);
  });

  it('ищет по началу имени и по началу слова, но не по середине', async () => {
    const byStart = await search(me, 'Чуж');
    expect(userIds(byStart)).toContain(stranger.userId);

    const byWordStart = await search(me, RUN_ID.slice(0, 3));
    expect(userIds(byWordStart)).toContain(stranger.userId);

    const byMiddle = await search(me, 'ужой');
    expect(userIds(byMiddle)).not.toContain(stranger.userId);
  });

  it('находит человека по username — и без ведущего @, и с ним', async () => {
    const plain = await search(me, `srch_${RUN_ID}_str`);
    expect(userIds(plain)).toContain(stranger.userId);

    const at = await search(me, `@srch_${RUN_ID}_stranger`);
    expect(userIds(at)).toContain(stranger.userId);
  });

  it('ведущий @ сужает выдачу до юзернеймов', async () => {
    const byName = await search(me, `Чужой ${RUN_ID}`);
    expect(userIds(byName)).toContain(stranger.userId);

    const byUsername = await search(me, `@Чужой ${RUN_ID}`);
    expect(userIds(byUsername)).not.toContain(stranger.userId);
  });

  it('человек, с которым чат уже есть, не задваивается в обеих секциях', async () => {
    const results = await search(me, RUN_ID);

    expect(chatTitles(results)).toContain(known.displayName);
    expect(userIds(results)).not.toContain(known.userId);
  });

  it('отвечает 400 на пустой запрос', async () => {
    const res = await request.get('/api/search?q=%20').set('Authorization', `Bearer ${me.token}`);
    expect(res.status).toBe(400);
  });

  it('требует авторизацию', async () => {
    const res = await request.get(`/api/search?q=${RUN_ID}`);
    expect(res.status).toBe(401);
  });
});
