import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SocketEvent, type MessageActionAck, type MessageSendAck } from '@messenger/shared';
import jwt from 'jsonwebtoken';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  LEGACY_REFRESH_COOKIE,
  REFRESH_COOKIE,
} from '../src/http/authCookies.js';
import { createSocketServer } from '../src/realtime/index.js';
import { sendMessage } from '../src/services/message.js';

/**
 * Обязательный набор из секции 9 project-design.md: каждый пункт должен получать отказ
 * (403 — недостаточно прав; 401 — не прошёл аутентификацию; 404 у файлов — намеренно вместо
 * 403, чтобы не подтверждать посторонним само существование чужого файла, см. file.ts).
 */

const app = createApp();
const request = supertest(app);
const httpServer = createServer(app);
createSocketServer(httpServer);

/** Каждый запуск — свой суффикс, чтобы не конфликтовать с прошлыми прогонами в общей dev-БД
 *  (тестовой БД/Docker в этом окружении нет — см. windows-dev-toolchain-constraints). */
const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];
const createdFileIds: string[] = [];

let sha256Counter = 0;
function fakeSha256(): string {
  sha256Counter += 1;
  return `${Date.now().toString(16)}${sha256Counter.toString(16)}`.padEnd(64, '0').slice(0, 64);
}

async function registerUser(suffix: string): Promise<{ token: string; userId: string; username: string }> {
  const username = `sec_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: 'Секьюрити' , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

let port: number;

function connectSocket(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error: Error) => reject(error));
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('security.test.ts — обязательный набор отказов (секция 9)', () => {
  let userA: Awaited<ReturnType<typeof registerUser>>;
  let userB: Awaited<ReturnType<typeof registerUser>>;
  let userC: Awaited<ReturnType<typeof registerUser>>;
  let chatId: string;
  /** Группа: userA — OWNER, userB — обычный MEMBER (не ADMIN) — для проверок 7-D. */
  let groupChatId: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;

    userA = await registerUser('a');
    userB = await registerUser('b');
    userC = await registerUser('c');

    const chatRes = await request
      .post('/api/chats/private')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ username: userB.username });
    expect([200, 201]).toContain(chatRes.status);
    chatId = chatRes.body.id as string;
    createdChatIds.push(chatId);

    const groupRes = await request
      .post('/api/chats/group')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'Группа безопасности', usernames: [userB.username] });
    expect(groupRes.status).toBe(201);
    groupChatId = groupRes.body.id as string;
    createdChatIds.push(groupChatId);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    // Порядок важен: Attachment.fileId — onDelete: Restrict, поэтому файлы удаляются только
    // после чатов (каскад Chat → Message → Attachment освобождает ссылку).
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('чтение чужого чата → 403 NOT_A_MEMBER', async () => {
    const res = await request.get(`/api/chats/${chatId}`).set('Authorization', `Bearer ${userC.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('история сообщений чужого чата → 403 NOT_A_MEMBER', async () => {
    const res = await request
      .get(`/api/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${userC.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('message:send без членства в чате → ack с ошибкой NOT_A_MEMBER', async () => {
    const socketC = await connectSocket(userC.token);
    try {
      const ack = await new Promise<MessageSendAck>((resolve) => {
        socketC.emit(
          SocketEvent.MessageSend,
          { chatId, clientId: `${RUN_ID}-nomember`, content: 'Чужой чат' },
          resolve,
        );
      });
      expect(ack.ok).toBe(false);
      expect(ack.error?.code).toBe('NOT_A_MEMBER');
    } finally {
      socketC.disconnect();
    }
  });

  it('скачивание чужого файла → 404 (не раскрывает само существование файла)', async () => {
    const file = await prisma.file.create({
      data: { sha256: fakeSha256(), storedName: `sec-${RUN_ID}.png`, mimeType: 'image/png', size: 10 },
    });
    createdFileIds.push(file.id);

    const message = await sendMessage({
      chatId,
      senderId: userA.userId,
      clientId: `${RUN_ID}-file`,
      attachment: { fileId: file.id, sha256: file.sha256, originalName: 'a.png' },
    });
    expect(message.attachment).not.toBeNull();

    const res = await request.get(`/api/files/${file.id}`).set('Authorization', `Bearer ${userC.token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('правка чужого сообщения (участник чата, но не автор) → ack с ошибкой', async () => {
    const message = await sendMessage({
      chatId,
      senderId: userA.userId,
      clientId: `${RUN_ID}-editme`,
      content: 'Оригинал',
    });

    const socketB = await connectSocket(userB.token);
    try {
      const ack = await new Promise<MessageActionAck>((resolve) => {
        socketB.emit(
          SocketEvent.MessageEdit,
          { chatId, messageId: message.id, content: 'Взломано' },
          resolve,
        );
      });
      expect(ack.ok).toBe(false);
    } finally {
      socketB.disconnect();
    }

    const stillOriginal = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stillOriginal?.content).toBe('Оригинал');
  });

  it('посторонний сокет не подписан на комнату чужого чата — message:new до него не доходит', async () => {
    const socketB = await connectSocket(userB.token);
    const socketC = await connectSocket(userC.token);
    try {
      // Даём bootstrapSocket время подписать оба сокета на комнаты их реальных чатов.
      await wait(150);

      const receivedByC: unknown[] = [];
      socketC.on(SocketEvent.MessageNew, (payload: unknown) => receivedByC.push(payload));
      const gotByB = new Promise<void>((resolve) => socketB.once(SocketEvent.MessageNew, () => resolve()));

      const ack = await new Promise<MessageSendAck>((resolve) => {
        socketB.emit(
          SocketEvent.MessageSend,
          { chatId, clientId: `${RUN_ID}-room`, content: 'Только для А и Б' },
          resolve,
        );
      });
      expect(ack.ok).toBe(true);

      await gotByB;
      await wait(150);
      expect(receivedByC).toHaveLength(0);
    } finally {
      socketB.disconnect();
      socketC.disconnect();
    }
  });

  it('истёкший access-токен → 401 TOKEN_INVALID', async () => {
    const expired = jwt.sign({ sub: userA.userId }, env.JWT_SECRET, { expiresIn: -10 });
    const res = await request.get('/api/users/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('подделанный access-токен (не тот секрет) → 401 TOKEN_INVALID', async () => {
    const forged = jwt.sign({ sub: userA.userId }, 'не тот секрет, сервер подписывает другим');
    const res = await request.get('/api/users/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('подделанный токен отклоняется уже на socket-handshake', async () => {
    const forged = jwt.sign({ sub: userA.userId }, 'ещё один неверный секрет');

    await expect(
      new Promise<void>((resolve, reject) => {
        const socket = ioClient(`http://127.0.0.1:${port}`, { auth: { token: forged }, forceNew: true });
        socket.once('connect', () => {
          socket.disconnect();
          reject(new Error('сокет не должен был подключиться с подделанным токеном'));
        });
        socket.once('connect_error', () => {
          socket.disconnect();
          resolve();
        });
      }),
    ).resolves.toBeUndefined();
  });

  // Кейсы из STAGES.md 7-D: права в группе проверяются отдельно от простого членства.
  describe('группы — управление участниками (STAGES.md 7-D)', () => {
    it('getMembers без членства в группе → 403 NOT_A_MEMBER', async () => {
      const res = await request
        .get(`/api/chats/${groupChatId}/members`)
        .set('Authorization', `Bearer ${userC.token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_A_MEMBER');
    });

    it('addMember обычным MEMBER (не OWNER/ADMIN) → 403', async () => {
      const res = await request
        .post(`/api/chats/${groupChatId}/members`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ username: 'кто_угодно_несуществующий' });
      expect(res.status).toBe(403);
    });

    it('removeMember чужого участника обычным MEMBER (не OWNER/ADMIN) → 403', async () => {
      const res = await request
        .delete(`/api/chats/${groupChatId}/members/${userA.userId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(res.status).toBe(403);

      const stillMember = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: groupChatId, userId: userA.userId } },
      });
      expect(stillMember).not.toBeNull();
    });

    it('updateMemberRole обычным MEMBER (не OWNER) → 403', async () => {
      const res = await request
        .patch(`/api/chats/${groupChatId}/members/${userB.userId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ role: 'ADMIN' });
      expect(res.status).toBe(403);

      const stillMember = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: groupChatId, userId: userB.userId } },
      });
      expect(stillMember?.role).toBe('MEMBER');
    });
  });
  describe('источник запроса и куки сессии (R-30D)', () => {
    function setCookiesOf(res: { headers: unknown }): string[] {
      const header = (res.headers as Record<string, string[] | string | undefined>)['set-cookie'];
      if (!header) return [];
      return Array.isArray(header) ? header : [header];
    }

    function findSetCookie(cookies: string[], name: string): string | undefined {
      return cookies.find((cookie) => cookie.startsWith(`${name}=`));
    }

    function valueOf(setCookie: string): string {
      return decodeURIComponent(setCookie.slice(setCookie.indexOf('=') + 1).split(';')[0]);
    }

    function attributeOf(setCookie: string, name: string): string | undefined {
      return setCookie
        .split(';')
        .slice(1)
        .map((part) => part.trim())
        .find((part) => part.toLowerCase() === name || part.toLowerCase().startsWith(`${name}=`));
    }

    async function openSession(suffix: string): Promise<{
      cookies: string[];
      cookieHeader: string;
      csrfToken: string;
      refreshToken: string;
    }> {
      const res = await request
        .post('/api/auth/register')
        .send({ username: `sec30d_${RUN_ID}_${suffix}`, password: 'password123', displayName: 'Куки' , ...CURRENT_LEGAL_VERSIONS });
      expect(res.status).toBe(201);
      createdUserIds.push(res.body.user.id as string);

      const cookies = setCookiesOf(res);
      const refresh = findSetCookie(cookies, REFRESH_COOKIE);
      const csrf = findSetCookie(cookies, CSRF_COOKIE);
      expect(refresh).toBeDefined();
      expect(csrf).toBeDefined();

      const refreshToken = valueOf(refresh as string);
      return {
        cookies,
        cookieHeader: `${REFRESH_COOKIE}=${refreshToken}; ${CSRF_COOKIE}=${valueOf(csrf as string)}`,
        csrfToken: res.body.csrfToken as string,
        refreshToken,
      };
    }

    it('кука сессии выставляется с префиксом __Host-: Path=/, Secure, HttpOnly, без Domain', async () => {
      const session = await openSession('attrs');
      const refresh = findSetCookie(session.cookies, REFRESH_COOKIE) as string;

      expect(attributeOf(refresh, 'path')).toBe('Path=/');
      expect(attributeOf(refresh, 'secure')).toBeDefined();
      expect(attributeOf(refresh, 'httponly')).toBeDefined();
      expect(attributeOf(refresh, 'domain')).toBeUndefined();
    });

    it('CSRF-токен приходит телом ответа и совпадает с кукой __Host-messenger_csrf', async () => {
      const session = await openSession('token');
      const csrf = findSetCookie(session.cookies, CSRF_COOKIE) as string;

      expect(session.csrfToken).toHaveLength(43);
      expect(valueOf(csrf)).toBe(session.csrfToken);
    });

    it('кука старого образца гасится тем же ответом', async () => {
      const session = await openSession('legacyclear');
      const legacy = findSetCookie(session.cookies, LEGACY_REFRESH_COOKIE);

      expect(legacy).toBeDefined();
      expect(legacy).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('refresh без заголовка X-CSRF-Token сессию не отменяет: сверять нечего, токен выдаётся заново', async () => {
      const session = await openSession('nocsrf');
      const res = await request.post('/api/auth/refresh').set('Cookie', session.cookieHeader).send({});

      expect(res.status).toBe(200);
      expect(res.body.csrfToken).toHaveLength(43);
    });

    it('отказ по CSRF не гасит куки сессии — разлогинить чужим запросом нельзя', async () => {
      const session = await openSession('healcsrf');
      const res = await request
        .post('/api/auth/refresh')
        .set('Cookie', session.cookieHeader)
        .set(CSRF_HEADER, 'c'.repeat(session.csrfToken.length))
        .send({});

      expect(res.status).toBe(403);
      const cookies = setCookiesOf(res);
      expect(findSetCookie(cookies, REFRESH_COOKIE)).toBeUndefined();
      expect(findSetCookie(cookies, CSRF_COOKIE)).toBeUndefined();
    });

    it('refresh с чужим CSRF-токеном → 403', async () => {
      const session = await openSession('badcsrf');
      const res = await request
        .post('/api/auth/refresh')
        .set('Cookie', session.cookieHeader)
        .set(CSRF_HEADER, 'a'.repeat(session.csrfToken.length))
        .send({});

      expect(res.status).toBe(403);
    });

    it('refresh с Origin соседнего поддомена mooo.com → 403', async () => {
      const session = await openSession('neighbour');
      const res = await request
        .post('/api/auth/refresh')
        .set('Cookie', session.cookieHeader)
        .set(CSRF_HEADER, session.csrfToken)
        .set('Origin', 'https://evil.mooo.com')
        .send({});

      expect(res.status).toBe(403);
    });

    it('refresh без Origin, но с Sec-Fetch-Site: cross-site → 403', async () => {
      const session = await openSession('crosssite');
      const res = await request
        .post('/api/auth/refresh')
        .set('Cookie', session.cookieHeader)
        .set(CSRF_HEADER, session.csrfToken)
        .set('Sec-Fetch-Site', 'cross-site')
        .send({});

      expect(res.status).toBe(403);
    });

    it('refresh из оболочки: разрешённый Origin при Sec-Fetch-Site: cross-site проходит', async () => {
      const session = await openSession('shell');
      const res = await request
        .post('/api/auth/refresh')
        .set('Cookie', session.cookieHeader)
        .set(CSRF_HEADER, session.csrfToken)
        .set('Origin', env.APP_ORIGIN)
        .set('Sec-Fetch-Site', 'cross-site')
        .send({});

      expect(res.status).toBe(200);
      expect(findSetCookie(setCookiesOf(res), REFRESH_COOKIE)).toBeDefined();
    });

    it('сессия старого образца обновляется без CSRF-токена и получает куки __Host-', async () => {
      const session = await openSession('upgrade');
      const res = await request
        .post('/api/auth/refresh')
        .set('Cookie', `${LEGACY_REFRESH_COOKIE}=${session.refreshToken}`)
        .send({});

      expect(res.status).toBe(200);
      const cookies = setCookiesOf(res);
      expect(findSetCookie(cookies, REFRESH_COOKIE)).toBeDefined();
      expect(res.body.csrfToken).toBeTruthy();
      expect(findSetCookie(cookies, LEGACY_REFRESH_COOKIE)).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('logout удаляет обе куки сессии', async () => {
      const session = await openSession('logout');
      const res = await request
        .post('/api/auth/logout')
        .set('Cookie', session.cookieHeader)
        .set(CSRF_HEADER, session.csrfToken)
        .send({});

      expect(res.status).toBe(204);
      const cookies = setCookiesOf(res);
      expect(findSetCookie(cookies, REFRESH_COOKIE)).toContain('Expires=Thu, 01 Jan 1970');
      expect(findSetCookie(cookies, CSRF_COOKIE)).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('запрос по заголовку Authorization без куки проверкой источника не трогается', async () => {
      const res = await request
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${userA.token}`)
        .set('Origin', 'https://evil.mooo.com')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ username: userB.username });

      expect([200, 201]).toContain(res.status);
    });
  });
});
