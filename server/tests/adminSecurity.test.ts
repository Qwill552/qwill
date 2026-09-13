import {
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_REAUTH_FAIL_LIMIT,
  ADMIN_TICKET_HEADER,
} from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { banUser, revokeAdminRole } from '../src/services/admin.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const PASSWORD = 'password123';
const LONG_PASSWORD = 'a'.repeat(ADMIN_PASSWORD_MIN_LENGTH);
const SHORT_PASSWORD = 'a'.repeat(12);
const createdUserIds: string[] = [];

interface TestUser {
  token: string;
  userId: string;
  username: string;
}

async function registerUser(suffix: string): Promise<TestUser> {
  const username = `r32e_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: PASSWORD, displayName: 'Проверка' , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function makeAdmin(user: TestUser, mustChangePassword = false): Promise<void> {
  await prisma.user.update({
    where: { id: user.userId },
    data: { role: 'admin', mustChangePassword },
  });
}

async function reauth(user: TestUser, password: string) {
  return request
    .post('/api/admin/reauth')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ password });
}

async function adminTicket(user: TestUser, password = PASSWORD): Promise<string> {
  const res = await reauth(user, password);
  expect(res.status).toBe(200);
  return res.body.ticket as string;
}

describe('защита админского аккаунта (R-32E)', () => {
  afterAll(async () => {
    await prisma.adminAction.deleteMany({ where: { adminId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('длинный пароль', () => {
    it('роль, выданная скриптом, не работает до смены пароля', async () => {
      const admin = await registerUser('mustchange');
      await makeAdmin(admin, true);

      const settings = await request
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(settings.status).toBe(403);
      expect(settings.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('админу 12 символов мало, 24 — достаточно; флаг снимается, панель открывается', async () => {
      const admin = await registerUser('longpass');
      await makeAdmin(admin, true);

      const short = await request
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ currentPassword: PASSWORD, newPassword: SHORT_PASSWORD });
      expect(short.status).toBe(400);

      const long = await request
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ currentPassword: PASSWORD, newPassword: LONG_PASSWORD });
      expect(long.status).toBe(200);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
      expect(stored.mustChangePassword).toBe(false);

      const settings = await request
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(settings.status).toBe(200);
    });

    it('обычному пользователю короткий пароль по-прежнему годится, чужой текущий — нет', async () => {
      const user = await registerUser('plainpass');

      const wrong = await request
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'not-the-password', newPassword: SHORT_PASSWORD });
      expect(wrong.status).toBe(400);

      const ok = await request
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: PASSWORD, newPassword: SHORT_PASSWORD });
      expect(ok.status).toBe(200);
    });
  });

  describe('короткая сессия', () => {
    it('у администратора срок сессии — часы, у обычного пользователя прежний', async () => {
      const admin = await registerUser('shortsession');
      await makeAdmin(admin);

      const login = await request
        .post('/api/auth/login')
        .send({ username: admin.username, password: PASSWORD });
      expect(login.status).toBe(200);

      const session = await prisma.session.findFirstOrThrow({
        where: { userId: admin.userId },
        orderBy: { createdAt: 'desc' },
      });
      const hours = (session.expiresAt.getTime() - session.createdAt.getTime()) / (60 * 60 * 1000);
      expect(Math.round(hours)).toBe(env.ADMIN_SESSION_TTL_HOURS);

      const user = await registerUser('longsession');
      const plain = await prisma.session.findFirstOrThrow({
        where: { userId: user.userId },
        orderBy: { createdAt: 'desc' },
      });
      const days = (plain.expiresAt.getTime() - plain.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(env.REFRESH_TOKEN_TTL_DAYS);
    });
  });

  describe('повторное подтверждение пароля', () => {
    it('чувствительные маршруты без билета отказывают, с билетом работают', async () => {
      const admin = await registerUser('ticket');
      await makeAdmin(admin);
      const target = await registerUser('tickettarget');

      const withoutTicket = await request
        .get(`/api/admin/users/${target.userId}/pii`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(withoutTicket.status).toBe(403);
      expect(withoutTicket.body.error.code).toBe('ADMIN_TICKET_REQUIRED');

      const banWithoutTicket = await request
        .post(`/api/admin/users/${target.userId}/ban`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reason: 'Проверка' });
      expect(banWithoutTicket.status).toBe(403);
      expect(banWithoutTicket.body.error.code).toBe('ADMIN_TICKET_REQUIRED');

      const ticket = await adminTicket(admin);
      const withTicket = await request
        .get(`/api/admin/users/${target.userId}/pii`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set(ADMIN_TICKET_HEADER, ticket);
      expect(withTicket.status).toBe(200);
    });

    it('списки, карточка, журнал и настройки читаются без билета', async () => {
      const admin = await registerUser('nolist');
      await makeAdmin(admin);
      const target = await registerUser('nolisttarget');

      for (const path of [
        '/api/admin/reports?view=open',
        '/api/admin/log',
        '/api/admin/settings',
        `/api/admin/users/${target.userId}`,
      ]) {
        const res = await request.get(path).set('Authorization', `Bearer ${admin.token}`);
        expect(res.status).toBe(200);
      }
    });

    it('подделанный и чужой билет отклоняются', async () => {
      const admin = await registerUser('forgery');
      const other = await registerUser('forgeryother');
      await makeAdmin(admin);
      await makeAdmin(other);
      const target = await registerUser('forgerytarget');

      const ticket = await adminTicket(admin);
      const tampered = `${ticket.slice(0, -1)}${ticket.endsWith('a') ? 'b' : 'a'}`;

      const forged = await request
        .get(`/api/admin/users/${target.userId}/pii`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set(ADMIN_TICKET_HEADER, tampered);
      expect(forged.status).toBe(403);

      const stolen = await request
        .get(`/api/admin/users/${target.userId}/pii`)
        .set('Authorization', `Bearer ${other.token}`)
        .set(ADMIN_TICKET_HEADER, ticket);
      expect(stolen.status).toBe(403);
      expect(stolen.body.error.code).toBe('ADMIN_TICKET_REQUIRED');
    });

    it('пять неверных паролей подряд запирают выдачу билетов, каждая неудача в журнале', async () => {
      const admin = await registerUser('bruteforce');
      await makeAdmin(admin);

      for (let attempt = 0; attempt < ADMIN_REAUTH_FAIL_LIMIT; attempt += 1) {
        const res = await reauth(admin, 'wrong-password');
        expect(res.status).toBe(401);
      }

      const locked = await reauth(admin, PASSWORD);
      expect(locked.status).toBe(429);

      const fails = await prisma.adminAction.count({
        where: { adminId: admin.userId, action: 'reauth.fail' },
      });
      expect(fails).toBe(ADMIN_REAUTH_FAIL_LIMIT);
    });

    it('удачное подтверждение обнуляет счётчик неудач', async () => {
      const admin = await registerUser('recover');
      await makeAdmin(admin);

      for (let attempt = 0; attempt < ADMIN_REAUTH_FAIL_LIMIT - 1; attempt += 1) {
        expect((await reauth(admin, 'wrong-password')).status).toBe(401);
      }
      expect((await reauth(admin, PASSWORD)).status).toBe(200);

      for (let attempt = 0; attempt < ADMIN_REAUTH_FAIL_LIMIT - 1; attempt += 1) {
        expect((await reauth(admin, 'wrong-password')).status).toBe(401);
      }
      expect((await reauth(admin, PASSWORD)).status).toBe(200);
    });
  });

  describe('последний администратор', () => {
    it('пока есть второй — бан и разжалование проходят, последнего не тронуть', async () => {
      const keeper = await registerUser('keeper');
      const actor = await registerUser('lastactor');
      await makeAdmin(keeper);
      await makeAdmin(actor);

      const outsiders = await prisma.user.count({
        where: { role: 'admin', bannedAt: null, id: { notIn: [keeper.userId, actor.userId] } },
      });
      if (outsiders > 0) return;

      const banKeeper = await request
        .post(`/api/admin/users/${keeper.userId}/ban`)
        .set('Authorization', `Bearer ${actor.token}`)
        .set(ADMIN_TICKET_HEADER, await adminTicket(actor))
        .send({ reason: 'Проверка' });
      expect(banKeeper.status).toBe(200);

      const unban = await request
        .delete(`/api/admin/users/${keeper.userId}/ban`)
        .set('Authorization', `Bearer ${actor.token}`)
        .set(ADMIN_TICKET_HEADER, await adminTicket(actor));
      expect(unban.status).toBe(200);

      await expect(revokeAdminRole(actor.username)).resolves.toMatchObject({ changed: true });

      await expect(
        banUser({ adminId: actor.userId, ip: 'test' }, keeper.userId, 'Проверка'),
      ).rejects.toThrow();
      await expect(revokeAdminRole(keeper.username)).rejects.toThrow();
    });
  });
});
