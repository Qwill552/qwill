import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SocketEvent, type ChatDeletedEvent, type ChatMutedEvent } from '@messenger/shared';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { createSocketServer } from '../src/realtime/index.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];
const openSockets: ClientSocket[] = [];

let httpServer: HttpServer;
let io: SocketServer;
let baseUrl: string;

async function registerUser(suffix: string): Promise<{ userId: string; username: string; accessToken: string }> {
  const username = `owndev_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix, ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username, accessToken: res.body.accessToken as string };
}

async function createPrivateChat(userId: string, targetUsername: string): Promise<string> {
  const { chatId } = await getOrCreatePrivateChat(userId, targetUsername);
  createdChatIds.push(chatId);
  return chatId;
}

function connectSocket(accessToken: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, { auth: { token: accessToken }, transports: ['websocket'], forceNew: true });
    openSockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as (payload: T) => void));
}

function collectEvents<T>(socket: ClientSocket, event: string): T[] {
  const received: T[] = [];
  socket.on(event, (payload: T) => received.push(payload));
  return received;
}

function settle(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('личные настройки чата доходят до всех устройств человека', () => {
  it('заглушение приходит на второе устройство и не уходит собеседнику', async () => {
    const alice = await registerUser('mute_alice');
    const bob = await registerUser('mute_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);

    const aliceSecondDevice = await connectSocket(alice.accessToken);
    const bobSocket = await connectSocket(bob.accessToken);
    const bobEvents = collectEvents<ChatMutedEvent>(bobSocket, SocketEvent.ChatMuted);

    const muted = waitForEvent<ChatMutedEvent>(aliceSecondDevice, SocketEvent.ChatMuted);
    const res = await request
      .patch(`/api/chats/${chatId}/mute`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ muted: true });
    expect(res.status).toBe(200);
    expect(await muted).toEqual({ chatId, muted: true });

    const unmuted = waitForEvent<ChatMutedEvent>(aliceSecondDevice, SocketEvent.ChatMuted);
    await request
      .patch(`/api/chats/${chatId}/mute`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ muted: false });
    expect(await unmuted).toEqual({ chatId, muted: false });

    await settle();
    expect(bobEvents).toHaveLength(0);
  });

  it('удаление «у себя» приходит на второе устройство и не уходит собеседнику', async () => {
    const alice = await registerUser('del_alice');
    const bob = await registerUser('del_bob');
    const chatId = await createPrivateChat(alice.userId, bob.username);
    await sendMessage({ chatId, senderId: bob.userId, clientId: `owndev_${RUN_ID}_1`, content: 'привет' });

    const aliceSecondDevice = await connectSocket(alice.accessToken);
    const bobSocket = await connectSocket(bob.accessToken);
    const bobEvents = collectEvents<ChatDeletedEvent>(bobSocket, SocketEvent.ChatDeleted);

    const deleted = waitForEvent<ChatDeletedEvent>(aliceSecondDevice, SocketEvent.ChatDeleted);
    const res = await request
      .delete(`/api/chats/${chatId}`)
      .query({ forEveryone: 'false' })
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(204);
    expect(await deleted).toEqual({ chatId });

    await settle();
    expect(bobEvents).toHaveLength(0);
  });
});
