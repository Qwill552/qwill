import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  SocketEvent,
  type CallAcceptAck,
  type CallEndedEvent,
  type CallInviteEvent,
  type CallParticipantChangedEvent,
  type CallStartAck,
} from '@messenger/shared';
import type { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { createSocketServer } from '../src/realtime/index.js';
import { getLiveCallsForParticipant } from '../src/services/call.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';

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
  const username = `callsig_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix , termsVersion: '1.0', privacyVersion: '1.0' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username, accessToken: res.body.accessToken as string };
}

async function createPrivateChat(userId: string, targetUsername: string): Promise<string> {
  const { chatId } = await getOrCreatePrivateChat(userId, targetUsername);
  createdChatIds.push(chatId);
  return chatId;
}

/** Сокет до установления соединения: события, которые сервер шлёт сразу на коннекте
 *  (`call:invite`, `call:live`), нужно ждать слушателем, повешенным до него. */
function openSocket(accessToken: string): ClientSocket {
  const socket = ioClient(baseUrl, { auth: { token: accessToken }, transports: ['websocket'], forceNew: true });
  openSockets.push(socket);
  return socket;
}

function connectSocket(accessToken: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = openSocket(accessToken);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve as (payload: T) => void));
}

function emitWithAck<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve as (response: T) => void));
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
  await prisma.call.deleteMany({ where: { chatId: { in: createdChatIds } } });
  await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('сигнализация звонков (этап ЗВОНКИ-3)', () => {
  it('call:start возвращает ack с токеном, второй участник получает call:invite', async () => {
    const a = await registerUser('cs1_a');
    const b = await registerUser('cs1_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const socketA = await connectSocket(a.accessToken);
    const socketB = await connectSocket(b.accessToken);

    const invitePromise = waitForEvent<CallInviteEvent>(socketB, SocketEvent.CallInvite);
    const startAck = await emitWithAck<CallStartAck>(socketA, SocketEvent.CallStart, { chatId, kind: 'AUDIO' });

    expect(startAck.ok).toBe(true);
    expect(startAck.access?.token.length).toBeGreaterThan(0);
    expect(startAck.access?.call.status).toBe('RINGING');

    const invite = await invitePromise;
    expect(invite.call.id).toBe(startAck.access?.call.id);
    expect(invite.call.status).toBe('RINGING');

    const endedPromise = waitForEvent<CallEndedEvent>(socketA, SocketEvent.CallEnded);
    socketB.emit(SocketEvent.CallDecline, { callId: startAck.access?.call.id });
    await endedPromise;
  });

  it('call:decline переводит звонок в DECLINED и рассылает call:ended', async () => {
    const a = await registerUser('cs2_a');
    const b = await registerUser('cs2_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const socketA = await connectSocket(a.accessToken);
    const socketB = await connectSocket(b.accessToken);

    const startAck = await emitWithAck<CallStartAck>(socketA, SocketEvent.CallStart, { chatId, kind: 'AUDIO' });
    const callId = startAck.access!.call.id;

    const endedPromise = waitForEvent<CallEndedEvent>(socketA, SocketEvent.CallEnded);
    socketB.emit(SocketEvent.CallDecline, { callId });

    const ended = await endedPromise;
    expect(ended.call.status).toBe('DECLINED');
    expect(ended.call.id).toBe(callId);
  });

  it('call:accept переводит звонок в ACTIVE и рассылает call:participantChanged', async () => {
    const a = await registerUser('cs3_a');
    const b = await registerUser('cs3_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const socketA = await connectSocket(a.accessToken);
    const socketB = await connectSocket(b.accessToken);

    const startAck = await emitWithAck<CallStartAck>(socketA, SocketEvent.CallStart, { chatId, kind: 'AUDIO' });
    const callId = startAck.access!.call.id;

    const participantChangedPromise = waitForEvent<CallParticipantChangedEvent>(
      socketA,
      SocketEvent.CallParticipantChanged,
    );
    const acceptAck = await emitWithAck<CallAcceptAck>(socketB, SocketEvent.CallAccept, { callId });

    expect(acceptAck.ok).toBe(true);
    expect(acceptAck.access?.call.status).toBe('ACTIVE');

    const changed = await participantChangedPromise;
    expect(changed.call.status).toBe('ACTIVE');
    expect(changed.call.id).toBe(callId);
  });

  it('call:leave в активном 1:1-звонке завершает его для обеих сторон', async () => {
    const a = await registerUser('cs3b_a');
    const b = await registerUser('cs3b_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const socketA = await connectSocket(a.accessToken);
    const socketB = await connectSocket(b.accessToken);

    const startAck = await emitWithAck<CallStartAck>(socketA, SocketEvent.CallStart, { chatId, kind: 'AUDIO' });
    const callId = startAck.access!.call.id;
    await emitWithAck<CallAcceptAck>(socketB, SocketEvent.CallAccept, { callId });

    const endedForA = waitForEvent<CallEndedEvent>(socketA, SocketEvent.CallEnded);
    const endedForB = waitForEvent<CallEndedEvent>(socketB, SocketEvent.CallEnded);
    socketA.emit(SocketEvent.CallLeave, { callId });

    const [endedA, endedB] = await Promise.all([endedForA, endedForB]);
    expect(endedA.call.status).toBe('ENDED');
    expect(endedB.call.status).toBe('ENDED');
  });

  it('после завершения в ленте чата появляется ровно одно сообщение типа CALL со ссылкой на звонок', async () => {
    const a = await registerUser('cs4_a');
    const b = await registerUser('cs4_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const socketA = await connectSocket(a.accessToken);
    const socketB = await connectSocket(b.accessToken);

    const startAck = await emitWithAck<CallStartAck>(socketA, SocketEvent.CallStart, { chatId, kind: 'AUDIO' });
    const callId = startAck.access!.call.id;

    const endedPromise = waitForEvent<CallEndedEvent>(socketA, SocketEvent.CallEnded);
    socketB.emit(SocketEvent.CallDecline, { callId });
    await endedPromise;

    const messages = await prisma.message.findMany({ where: { chatId, type: 'CALL' } });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.callId).toBe(callId);
  });

  it('участник активного звонка числится живым, пока звонок не завершён — на этом держится возврат после перезапуска', async () => {
    const a = await registerUser('cs6_a');
    const b = await registerUser('cs6_b');
    const chatId = await createPrivateChat(a.userId, b.username);

    const socketA = await connectSocket(a.accessToken);
    const socketB = await connectSocket(b.accessToken);

    const startAck = await emitWithAck<CallStartAck>(socketA, SocketEvent.CallStart, { chatId, kind: 'AUDIO' });
    const callId = startAck.access!.call.id;
    const acceptAck = await emitWithAck<CallAcceptAck>(socketB, SocketEvent.CallAccept, { callId });
    expect(acceptAck.ok).toBe(true);

    const liveForB = await getLiveCallsForParticipant(b.userId);
    expect(liveForB.map((call) => call.id)).toContain(callId);
    expect(liveForB.find((call) => call.id === callId)?.status).toBe('ACTIVE');

    const endedPromise = waitForEvent<CallEndedEvent>(socketA, SocketEvent.CallEnded);
    socketA.emit(SocketEvent.CallLeave, { callId });
    await endedPromise;

    expect(await getLiveCallsForParticipant(b.userId)).toHaveLength(0);
  });

  it('не-участник чата на call:start получает ack с ошибкой и без токена', async () => {
    const a = await registerUser('cs5_a');
    const b = await registerUser('cs5_b');
    const outsider = await registerUser('cs5_outsider');
    const chatId = await createPrivateChat(a.userId, b.username);

    const socketOutsider = await connectSocket(outsider.accessToken);

    const startAck = await emitWithAck<CallStartAck>(socketOutsider, SocketEvent.CallStart, { chatId, kind: 'AUDIO' });

    expect(startAck.ok).toBe(false);
    expect(startAck.access).toBeUndefined();
    expect(startAck.error?.code).toBe('NOT_A_MEMBER');
  });
});
