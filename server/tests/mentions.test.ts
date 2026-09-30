import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
}));

vi.mock('firebase-admin/messaging', () => {
  const messaging = { send: vi.fn() };
  return { getMessaging: vi.fn(() => messaging) };
});

import {
  SocketEvent,
  type ChatListItemDto,
  type ChatMentionsEvent,
  type MentionsReadAck,
} from '@messenger/shared';
import webpush from 'web-push';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import supertest from 'supertest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { createSocketServer } from '../src/realtime/index.js';
import { createGroupChat, getOrCreatePrivateChat, markChatRead, setChatMuted } from '../src/services/chat.js';
import { deleteMessage, sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];
const openSockets: ClientSocket[] = [];
let messageSeq = 0;

let httpServer: HttpServer;
let io: SocketServer;
let baseUrl: string;

interface TestUser {
  userId: string;
  username: string;
  accessToken: string;
}

async function registerUser(suffix: string): Promise<TestUser> {
  const username = `mnt_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix, ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username, accessToken: res.body.accessToken as string };
}

async function group(owner: TestUser, members: TestUser[]): Promise<string> {
  const { chatId } = await createGroupChat(
    owner.userId,
    `Группа ${RUN_ID}`,
    members.map((member) => member.username),
  );
  createdChatIds.push(chatId);
  return chatId;
}

async function send(chatId: string, sender: TestUser, content: string, replyToId?: number): Promise<number> {
  messageSeq += 1;
  const message = await sendMessage({
    chatId,
    senderId: sender.userId,
    clientId: `mnt_${RUN_ID}_${messageSeq}`,
    content,
    replyToId,
  });
  return message.id;
}

async function mentionedIn(messageId: number): Promise<string[]> {
  const rows = await prisma.messageMention.findMany({ where: { messageId }, select: { userId: true } });
  return rows.map((row) => row.userId).sort();
}

async function listItem(user: TestUser, chatId: string): Promise<ChatListItemDto | undefined> {
  const res = await request.get('/api/chats').set('Authorization', `Bearer ${user.accessToken}`);
  expect(res.status).toBe(200);
  return (res.body.chats as ChatListItemDto[]).find((chat) => chat.id === chatId);
}

async function detailCount(user: TestUser, chatId: string): Promise<number> {
  const res = await request.get(`/api/chats/${chatId}`).set('Authorization', `Bearer ${user.accessToken}`);
  expect(res.status).toBe(200);
  return res.body.unreadMentionsCount as number;
}

async function unreadIds(user: TestUser, chatId: string): Promise<number[]> {
  const res = await request.get(`/api/chats/${chatId}/mentions`).set('Authorization', `Bearer ${user.accessToken}`);
  expect(res.status).toBe(200);
  return res.body.messageIds as number[];
}

function connectSocket(accessToken: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, { auth: { token: accessToken }, transports: ['websocket'], forceNew: true });
    openSockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function readMentionsOver(socket: ClientSocket, payload: { chatId: string; messageIds?: number[] }): Promise<MentionsReadAck> {
  return new Promise((resolve) => socket.emit(SocketEvent.MentionsRead, payload, resolve));
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as (payload: T) => void));
}

function settle(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pushedTo(endpoint: string): boolean {
  return vi
    .mocked(webpush.sendNotification)
    .mock.calls.some(([subscription]) => (subscription as { endpoint: string }).endpoint === endpoint);
}

async function subscribeWebPush(user: TestUser, tag: string): Promise<string> {
  const endpoint = `https://push.example.test/${RUN_ID}_${tag}`;
  await prisma.pushSubscription.create({
    data: { userId: user.userId, provider: 'webpush', endpoint, p256dh: 'p', auth: 'a' },
  });
  return endpoint;
}

beforeAll(async () => {
  httpServer = createServer(app);
  io = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterEach(() => {
  for (const socket of openSockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.message.deleteMany({ where: { chatId: { in: createdChatIds } } });
  await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
  await prisma.chat.deleteMany({ where: { members: { some: { userId: { in: createdUserIds } } } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('кто упомянут', () => {
  it('упоминание по нику, в любом регистре, без себя и без не-участника', async () => {
    const alice = await registerUser('who_a');
    const bob = await registerUser('who_b');
    const carol = await registerUser('who_c');
    const stranger = await registerUser('who_s');
    const chatId = await group(alice, [bob, carol]);

    const id = await send(
      chatId,
      alice,
      `@${bob.username.toUpperCase()} и @${alice.username}, и @${stranger.username}`,
    );
    expect(await mentionedIn(id)).toEqual([bob.userId]);
  });

  it('ответ на чужое сообщение упоминает его автора, ответ на своё — нет', async () => {
    const alice = await registerUser('reply_a');
    const bob = await registerUser('reply_b');
    const chatId = await group(alice, [bob]);

    const bobMessage = await send(chatId, bob, 'вопрос');
    const answer = await send(chatId, alice, 'ответ', bobMessage);
    expect(await mentionedIn(answer)).toEqual([bob.userId]);

    const ownFollowUp = await send(chatId, bob, 'и ещё', bobMessage);
    expect(await mentionedIn(ownFollowUp)).toEqual([]);
  });

  it('в личном чате упоминаний нет', async () => {
    const alice = await registerUser('priv_a');
    const bob = await registerUser('priv_b');
    const { chatId } = await getOrCreatePrivateChat(alice.userId, bob.username);
    createdChatIds.push(chatId);

    const id = await send(chatId, alice, `@${bob.username}`);
    expect(await mentionedIn(id)).toEqual([]);
  });

  it('объявление и тихое сообщение упоминаний не создают', async () => {
    const alice = await registerUser('silent_a');
    const bob = await registerUser('silent_b');
    const chatId = await group(alice, [bob]);

    messageSeq += 1;
    const silent = await sendMessage({
      chatId,
      senderId: alice.userId,
      clientId: `mnt_${RUN_ID}_${messageSeq}`,
      content: `@${bob.username}`,
      silent: true,
    });
    expect(await mentionedIn(silent.id)).toEqual([]);
  });
});

describe('счёт и список', () => {
  it('unreadMentionsCount в /chats и /chats/:id, chat:read счёт не трогает', async () => {
    const alice = await registerUser('count_a');
    const bob = await registerUser('count_b');
    const chatId = await group(alice, [bob]);

    const first = await send(chatId, alice, `@${bob.username} раз`);
    await send(chatId, alice, `@${bob.username} два`);

    expect((await listItem(bob, chatId))?.unreadMentionsCount).toBe(2);
    expect(await detailCount(bob, chatId)).toBe(2);
    expect((await listItem(alice, chatId))?.unreadMentionsCount).toBe(0);

    await markChatRead(chatId, bob.userId, first + 1000);
    expect(await detailCount(bob, chatId)).toBe(2);
  });

  it('/mentions — по возрастанию, без прочитанных и удалённых', async () => {
    const alice = await registerUser('list_a');
    const bob = await registerUser('list_b');
    const chatId = await group(alice, [bob]);

    const first = await send(chatId, alice, `@${bob.username} 1`);
    const second = await send(chatId, alice, `@${bob.username} 2`);
    const third = await send(chatId, alice, `@${bob.username} 3`);
    const fourth = await send(chatId, alice, `@${bob.username} 4`);

    await deleteMessage({ chatId, messageId: second, userId: alice.userId });
    await prisma.messageMention.update({
      where: { messageId_userId: { messageId: third, userId: bob.userId } },
      data: { readAt: new Date() },
    });

    expect(await unreadIds(bob, chatId)).toEqual([first, fourth]);
    expect(await detailCount(bob, chatId)).toBe(2);
  });

  it('/mentions не участнику — отказ', async () => {
    const alice = await registerUser('deny_a');
    const bob = await registerUser('deny_b');
    const outsider = await registerUser('deny_o');
    const chatId = await group(alice, [bob]);

    const res = await request.get(`/api/chats/${chatId}/mentions`).set('Authorization', `Bearer ${outsider.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('mentions:read', () => {
  it('частями и целиком, событие приходит на второе устройство того же человека', async () => {
    const alice = await registerUser('read_a');
    const bob = await registerUser('read_b');
    const chatId = await group(alice, [bob]);

    const first = await send(chatId, alice, `@${bob.username} 1`);
    await send(chatId, alice, `@${bob.username} 2`);
    await send(chatId, alice, `@${bob.username} 3`);

    const bobPhone = await connectSocket(bob.accessToken);
    const bobDesktop = await connectSocket(bob.accessToken);

    const partialEvent = waitForEvent<ChatMentionsEvent>(bobDesktop, SocketEvent.ChatMentions);
    const partial = await readMentionsOver(bobPhone, { chatId, messageIds: [first] });
    expect(partial).toEqual({ ok: true, unreadMentionsCount: 2 });
    expect(await partialEvent).toEqual({ chatId, unreadMentionsCount: 2 });

    const allEvent = waitForEvent<ChatMentionsEvent>(bobDesktop, SocketEvent.ChatMentions);
    const all = await readMentionsOver(bobPhone, { chatId });
    expect(all).toEqual({ ok: true, unreadMentionsCount: 0 });
    expect(await allEvent).toEqual({ chatId, unreadMentionsCount: 0 });

    expect(await unreadIds(bob, chatId)).toEqual([]);
  });

  it('не участнику — отказ в подтверждении', async () => {
    const alice = await registerUser('rdeny_a');
    const bob = await registerUser('rdeny_b');
    const outsider = await registerUser('rdeny_o');
    const chatId = await group(alice, [bob]);

    const socket = await connectSocket(outsider.accessToken);
    const ack = await readMentionsOver(socket, { chatId });
    expect(ack.ok).toBe(false);
  });
});

describe('пуш упомянутому в заглушённой группе', () => {
  it('уходит, если личный чат с автором не заглушён', async () => {
    const alice = await registerUser('push_a');
    const bob = await registerUser('push_b');
    const carol = await registerUser('push_c');
    const chatId = await group(alice, [bob, carol]);
    await setChatMuted(chatId, bob.userId, true);
    await setChatMuted(chatId, carol.userId, true);

    const bobEndpoint = await subscribeWebPush(bob, 'bob');
    const carolEndpoint = await subscribeWebPush(carol, 'carol');
    vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as never);

    await send(chatId, alice, `@${bob.username} глянь`);

    await vi.waitFor(() => expect(pushedTo(bobEndpoint)).toBe(true));
    await settle();
    expect(pushedTo(carolEndpoint)).toBe(false);
  });

  it('не уходит, если заглушён личный чат с автором', async () => {
    const alice = await registerUser('pmute_a');
    const bob = await registerUser('pmute_b');
    const chatId = await group(alice, [bob]);
    await setChatMuted(chatId, bob.userId, true);

    const { chatId: privateChatId } = await getOrCreatePrivateChat(bob.userId, alice.username);
    createdChatIds.push(privateChatId);
    await setChatMuted(privateChatId, bob.userId, true);

    const endpoint = await subscribeWebPush(bob, 'pmute');
    vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as never);

    await send(chatId, alice, `@${bob.username} глянь`);
    await settle();
    expect(pushedTo(endpoint)).toBe(false);
  });
});
