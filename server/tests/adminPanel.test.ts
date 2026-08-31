import { ADMIN_TICKET_HEADER } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const PASSWORD = 'password123';
const createdUserIds: string[] = [];

interface TestUser {
  token: string;
  userId: string;
  username: string;
}

async function registerUser(suffix: string, displayName: string): Promise<TestUser> {
  const username = `r32b_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: PASSWORD, displayName });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function makeAdmin(user: TestUser): Promise<void> {
  await prisma.user.update({ where: { id: user.userId }, data: { role: 'admin' } });
}

async function adminTicket(user: TestUser): Promise<string> {
  const res = await request
    .post('/api/admin/reauth')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.ticket as string;
}

describe('панель администрирования (R-32B)', () => {
  afterAll(async () => {
    await prisma.report.deleteMany({ where: { reporterId: { in: createdUserIds } } });
    await prisma.adminAction.deleteMany({ where: { adminId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('карточка пользователя', () => {
    it('находит по username и отдаёт карточку по id', async () => {
      const admin = await registerUser('cardadmin', 'Админ карточек');
      await makeAdmin(admin);
      const target = await registerUser('cardtarget', 'Обычный пользователь');

      const byUsername = await request
        .get(`/api/admin/users/by-username/${target.username}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(byUsername.status).toBe(200);
      expect(byUsername.body.id).toBe(target.userId);
      expect(byUsername.body.chatCount).toBe(0);
      expect(byUsername.body.hasAvatar).toBe(false);

      const byId = await request
        .get(`/api/admin/users/${target.userId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(byId.status).toBe(200);
      expect(byId.body.username).toBe(target.username);
    });

    it('несуществующее имя отвечает 404', async () => {
      const admin = await registerUser('missadmin', 'Админ поиска');
      await makeAdmin(admin);

      const res = await request
        .get(`/api/admin/users/by-username/${RUN_ID}_no_such_user`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('правка модерационных полей', () => {
    it('меняет displayName и пишет в журнал', async () => {
      const admin = await registerUser('nameadmin', 'Админ имён');
      await makeAdmin(admin);
      const target = await registerUser('nametarget', 'Старое имя');

      const res = await request
        .patch(`/api/admin/users/${target.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ displayName: 'Новое имя' });
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Новое имя');

      const action = await prisma.adminAction.findFirst({
        where: { adminId: admin.userId, action: 'user.displayName', targetUserId: target.userId },
      });
      expect(action).not.toBeNull();
    });

    it('снимает «О себе» и визитку, отражая это в счётчиках hasBio/hasCard', async () => {
      const admin = await registerUser('clearadmin', 'Админ очистки');
      await makeAdmin(admin);
      const target = await registerUser('cleartarget', 'С профилем');

      await prisma.user.update({ where: { id: target.userId }, data: { bio: 'Немного текста' } });

      const bioBefore = await request
        .get(`/api/admin/users/${target.userId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(bioBefore.body.hasBio).toBe(true);

      const clearBio = await request
        .delete(`/api/admin/users/${target.userId}/bio`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(clearBio.status).toBe(200);
      expect(clearBio.body.hasBio).toBe(false);

      const clearCard = await request
        .delete(`/api/admin/users/${target.userId}/card/content`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(clearCard.status).toBe(200);
      expect(clearCard.body.hasCard).toBe(false);

      const actions = await prisma.adminAction.findMany({
        where: { adminId: admin.userId, targetUserId: target.userId },
      });
      expect(actions.map((a) => a.action).sort()).toEqual(['user.bio.clear', 'user.card.clear']);
    });
  });

  describe('IP по требованию', () => {
    it('не отдаётся в карточке, но доступен по отдельному маршруту и пишет журнал при каждом вызове', async () => {
      const admin = await registerUser('piiadmin', 'Админ IP');
      await makeAdmin(admin);
      const target = await registerUser('piitarget', 'Под наблюдением');

      const cardRes = await request
        .get(`/api/admin/users/${target.userId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(cardRes.body.ip).toBeUndefined();
      expect(cardRes.body.sessions).toBeUndefined();

      const ticket = await adminTicket(admin);
      const first = await request
        .get(`/api/admin/users/${target.userId}/pii`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set(ADMIN_TICKET_HEADER, ticket);
      expect(first.status).toBe(200);
      expect(Array.isArray(first.body.sessions)).toBe(true);
      expect(first.body.sessions.length).toBeGreaterThan(0);
      expect(first.body.sessions[0].ip).not.toBeNull();

      const second = await request
        .get(`/api/admin/users/${target.userId}/pii`)
        .set('Authorization', `Bearer ${admin.token}`)
        .set(ADMIN_TICKET_HEADER, ticket);
      expect(second.status).toBe(200);

      const reveals = await prisma.adminAction.count({
        where: { adminId: admin.userId, targetUserId: target.userId, action: 'user.pii.reveal' },
      });
      expect(reveals).toBe(2);
    });
  });

  describe('разрыв сессий без бана', () => {
    it('удаляет все сессии, но вход остаётся возможным', async () => {
      const admin = await registerUser('revokeadmin', 'Админ сессий');
      await makeAdmin(admin);
      const target = await registerUser('revoketarget', 'С угнанным аккаунтом');

      const before = await prisma.session.count({ where: { userId: target.userId } });
      expect(before).toBeGreaterThan(0);

      const res = await request
        .post(`/api/admin/users/${target.userId}/sessions/revoke`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.sessionCount).toBe(0);

      const after = await prisma.session.count({ where: { userId: target.userId } });
      expect(after).toBe(0);

      const login = await request
        .post('/api/auth/login')
        .send({ username: target.username, password: PASSWORD });
      expect(login.status).toBe(200);
    });
  });

  describe('журнал', () => {
    it('читается с фильтрами и не имеет пишущих маршрутов', async () => {
      const admin = await registerUser('logadmin', 'Админ журнала');
      await makeAdmin(admin);
      const target = await registerUser('logtarget', 'Записанный');

      await request
        .patch(`/api/admin/users/${target.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ displayName: 'Отмеченный в журнале' });

      const page = await request.get('/api/admin/log').set('Authorization', `Bearer ${admin.token}`);
      expect(page.status).toBe(200);
      expect(Array.isArray(page.body.entries)).toBe(true);
      expect(
        page.body.entries.some(
          (entry: { adminId: string; action: string }) =>
            entry.adminId === admin.userId && entry.action === 'user.displayName',
        ),
      ).toBe(true);

      const filtered = await request
        .get(`/api/admin/log?admin=${admin.username}&action=user.displayName`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(filtered.status).toBe(200);
      expect(filtered.body.entries.length).toBeGreaterThan(0);

      const someId = page.body.entries[0]?.id as string;
      const patchAttempt = await request
        .patch(`/api/admin/log/${someId}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ action: 'tampered' });
      expect(patchAttempt.status).toBe(404);

      const deleteAttempt = await request
        .delete(`/api/admin/log/${someId}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(deleteAttempt.status).toBe(404);
    });
  });

  describe('доступ обычного пользователя', () => {
    it('получает 403 на карточке, pii и журнале', async () => {
      const user = await registerUser('plainuser', 'Обычный');
      const other = await registerUser('plaintarget', 'Другой обычный');

      const card = await request
        .get(`/api/admin/users/${other.userId}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(card.status).toBe(403);

      const pii = await request
        .get(`/api/admin/users/${other.userId}/pii`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(pii.status).toBe(403);

      const log = await request.get('/api/admin/log').set('Authorization', `Bearer ${user.token}`);
      expect(log.status).toBe(403);
    });
  });
});
