import { PROFILE_CARDS_SETTING_KEY } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { banUser, grantAdminRole, revokeAdminRole } from '../src/services/admin.js';

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
  const username = `r32a_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: PASSWORD, displayName });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function makeAdmin(user: TestUser): Promise<void> {
  await prisma.user.update({ where: { id: user.userId }, data: { role: 'admin' } });
}

describe('администрирование (R-32A)', () => {
  let profileCardsBefore: string | null = null;

  beforeAll(async () => {
    const setting = await prisma.appSetting.findUnique({ where: { key: PROFILE_CARDS_SETTING_KEY } });
    profileCardsBefore = setting?.value ?? null;
  });

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { reporterId: { in: createdUserIds } } });
    await prisma.adminAction.deleteMany({ where: { adminId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (profileCardsBefore === null) {
      await prisma.appSetting.deleteMany({ where: { key: PROFILE_CARDS_SETTING_KEY } });
    } else {
      await prisma.appSetting.update({
        where: { key: PROFILE_CARDS_SETTING_KEY },
        data: { value: profileCardsBefore },
      });
    }
    await prisma.$disconnect();
  });

  describe('зарезервированные имена', () => {
    it('отклоняет регистрацию под qwill, admin, support и Qwill', async () => {
      for (const username of ['qwill', 'admin', 'support', 'Qwill']) {
        const res = await request
          .post('/api/auth/register')
          .send({ username, password: PASSWORD, displayName: 'Самозванец' });
        expect(res.status).toBe(400);
      }
    });

    it('обычное имя по-прежнему регистрируется, роль в ответе — user', async () => {
      const user = await registerUser('plain', 'Обычный');
      const me = await request.get('/api/users/me').set('Authorization', `Bearer ${user.token}`);
      expect(me.status).toBe(200);
      expect(me.body.role).toBe('user');
    });
  });

  describe('доступ', () => {
    it('обычному пользователю на любом /admin/* — 403', async () => {
      const user = await registerUser('outsider', 'Посторонний');

      const reports = await request.get('/api/admin/reports').set('Authorization', `Bearer ${user.token}`);
      expect(reports.status).toBe(403);

      const settings = await request
        .patch('/api/admin/settings/profile-cards')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ enabled: false });
      expect(settings.status).toBe(403);
    });

    it('снятая роль отказывает сразу, не дожидаясь истечения токена', async () => {
      const admin = await registerUser('demoted', 'Разжалованный');
      await makeAdmin(admin);

      const before = await request.get('/api/admin/settings').set('Authorization', `Bearer ${admin.token}`);
      expect(before.status).toBe(200);

      await prisma.user.update({ where: { id: admin.userId }, data: { role: 'user' } });

      const after = await request.get('/api/admin/settings').set('Authorization', `Bearer ${admin.token}`);
      expect(after.status).toBe(403);
    });
  });

  describe('роль из консоли', () => {
    it('выдаётся скриптом и повторный запуск ничего не меняет', async () => {
      const user = await registerUser('granted', 'Назначенный');

      const first = await grantAdminRole(user.username);
      expect(first.changed).toBe(true);
      expect(first.user.role).toBe('admin');
      expect(first.user.mustChangePassword).toBe(true);

      const second = await grantAdminRole(user.username.toUpperCase());
      expect(second.changed).toBe(false);

      const logged = await prisma.adminAction.count({
        where: { adminId: user.userId, action: 'role.grant' },
      });
      expect(logged).toBe(1);
    });

    it('последнего администратора не разжалует', async () => {
      const user = await registerUser('lastadmin', 'Последний');
      await makeAdmin(user);

      const others = await prisma.user.count({ where: { role: 'admin', id: { not: user.userId } } });
      if (others > 0) {
        await expect(revokeAdminRole(user.username)).resolves.toMatchObject({ changed: true });
        return;
      }
      await expect(revokeAdminRole(user.username)).rejects.toThrow();
    });
  });

  describe('бан', () => {
    it('рвёт сессии, отклоняет токен и вход, разбан возвращает доступ', async () => {
      const admin = await registerUser('banner', 'Администратор');
      await makeAdmin(admin);
      const target = await registerUser('banned', 'Нарушитель');

      const ban = await request
        .post(`/api/admin/users/${target.userId}/ban`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reason: 'Спам' });
      expect(ban.status).toBe(200);
      expect(ban.body.bannedAt).not.toBeNull();

      expect(await prisma.session.count({ where: { userId: target.userId } })).toBe(0);

      const withOldToken = await request.get('/api/users/me').set('Authorization', `Bearer ${target.token}`);
      expect(withOldToken.status).toBe(403);
      expect(withOldToken.body.error.code).toBe('USER_BANNED');

      const login = await request
        .post('/api/auth/login')
        .send({ username: target.username, password: PASSWORD });
      expect(login.status).toBe(403);
      expect(login.body.error.message).toContain('Спам');

      const unban = await request
        .delete(`/api/admin/users/${target.userId}/ban`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(unban.status).toBe(200);
      expect(unban.body.bannedAt).toBeNull();

      const again = await request
        .post('/api/auth/login')
        .send({ username: target.username, password: PASSWORD });
      expect(again.status).toBe(200);
    });

    it('себя забанить нельзя', async () => {
      const admin = await registerUser('selfban', 'Самобан');
      await makeAdmin(admin);

      const res = await request
        .post(`/api/admin/users/${admin.userId}/ban`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reason: 'Проверка' });
      expect(res.status).toBe(400);
    });

    it('один администратор банит другого, пока тот не последний', async () => {
      const admin = await registerUser('banadmin_a', 'Первый');
      const other = await registerUser('banadmin_b', 'Второй');
      await makeAdmin(admin);
      await makeAdmin(other);

      const res = await request
        .post(`/api/admin/users/${other.userId}/ban`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ reason: 'Проверка' });
      expect(res.status).toBe(200);
    });

    it('последнего администратора забанить нельзя', async () => {
      const actor = await registerUser('banadmin_actor', 'Действующий');
      const target = await registerUser('banadmin_last', 'Последний админ');
      await makeAdmin(target);

      const others = await prisma.user.count({
        where: { role: 'admin', bannedAt: null, id: { not: target.userId } },
      });
      const attempt = banUser({ adminId: actor.userId, ip: 'test' }, target.userId, 'Проверка');

      if (others > 0) {
        await expect(attempt).resolves.toMatchObject({ id: target.userId });
        return;
      }
      await expect(attempt).rejects.toThrow();
    });
  });

  describe('выключатели визиток', () => {
    it('глобальный рубильник переключается и читается без перезапуска', async () => {
      const admin = await registerUser('switch', 'Рубильник');
      await makeAdmin(admin);

      const off = await request
        .patch('/api/admin/settings/profile-cards')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ enabled: false });
      expect(off.status).toBe(200);
      expect(off.body.profileCardsEnabled).toBe(false);

      const read = await request.get('/api/admin/settings').set('Authorization', `Bearer ${admin.token}`);
      expect(read.body.profileCardsEnabled).toBe(false);

      const on = await request
        .patch('/api/admin/settings/profile-cards')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ enabled: true });
      expect(on.body.profileCardsEnabled).toBe(true);
    });

    it('визитка отдельного пользователя выключается', async () => {
      const admin = await registerUser('cardadmin', 'Админ визиток');
      await makeAdmin(admin);
      const target = await registerUser('cardtarget', 'Владелец визитки');

      const res = await request
        .patch(`/api/admin/users/${target.userId}/card`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ disabled: true });
      expect(res.status).toBe(200);
      expect(res.body.cardDisabled).toBe(true);
    });
  });

  describe('жалобы', () => {
    it('шестая жалоба за сутки отклоняется', async () => {
      const reporter = await registerUser('reporter', 'Жалобщик');
      const target = await registerUser('reported', 'Обвиняемый');

      for (let i = 0; i < 5; i += 1) {
        const res = await request
          .post('/api/reports')
          .set('Authorization', `Bearer ${reporter.token}`)
          .send({ targetUserId: target.userId, kind: 'profile', comment: `Жалоба ${i + 1}` });
        expect(res.status).toBe(201);
      }

      const sixth = await request
        .post('/api/reports')
        .set('Authorization', `Bearer ${reporter.token}`)
        .send({ targetUserId: target.userId, kind: 'profile', comment: 'Шестая' });
      expect(sixth.status).toBe(429);
    });

    it('администратор видит список жалоб', async () => {
      const admin = await registerUser('reportadmin', 'Разбирающий');
      await makeAdmin(admin);
      const reporter = await registerUser('reporter2', 'Жалобщик 2');
      const target = await registerUser('reported2', 'Обвиняемый 2');

      await request
        .post('/api/reports')
        .set('Authorization', `Bearer ${reporter.token}`)
        .send({ targetUserId: target.userId, kind: 'card', comment: 'Непристойная визитка' });

      const list = await request.get('/api/admin/reports').set('Authorization', `Bearer ${admin.token}`);
      expect(list.status).toBe(200);
      expect(list.body.some((report: { reporterId: string }) => report.reporterId === reporter.userId)).toBe(true);
    });
  });

  describe('журнал', () => {
    it('каждое действие оставляет строку с IP', async () => {
      const admin = await registerUser('logger', 'Журналист');
      await makeAdmin(admin);
      const target = await registerUser('logged', 'Подопечный');

      await request
        .patch(`/api/admin/users/${target.userId}/card`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ disabled: true });

      await request
        .patch('/api/admin/settings/profile-cards')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ enabled: true });

      const actions = await prisma.adminAction.findMany({ where: { adminId: admin.userId } });
      expect(actions.map((action) => action.action).sort()).toEqual(['settings.profileCards', 'user.card']);
      for (const action of actions) expect(action.ip.length).toBeGreaterThan(0);
    });
  });
});
