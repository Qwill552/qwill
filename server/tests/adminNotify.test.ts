import { ADMIN_REAUTH_FAIL_LIMIT } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/telegram.js', () => ({
  notifyAdmin: vi.fn(),
  telegramNotifyState: vi.fn(() => ({ configured: true, missing: [] })),
  sendTelegramMessageRaw: vi.fn(),
}));

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { notifyAdmin } from '../src/lib/telegram.js';

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

async function registerUser(suffix: string): Promise<TestUser> {
  const username = `r32f_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: PASSWORD, displayName: 'Проверка' , termsVersion: '1.0', privacyVersion: '1.0' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function makeAdmin(user: TestUser): Promise<void> {
  await prisma.user.update({
    where: { id: user.userId },
    data: { role: 'admin', mustChangePassword: false },
  });
}

function notifiedTypes(): string[] {
  return vi.mocked(notifyAdmin).mock.calls.map((call) => call[0]);
}

describe('уведомления администратора о событиях (R-32F)', () => {
  beforeEach(() => {
    vi.mocked(notifyAdmin).mockClear();
  });

  afterAll(async () => {
    await prisma.adminAction.deleteMany({ where: { adminId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('вход в аккаунт', () => {
    it('вход администратора уведомляет', async () => {
      const admin = await registerUser('login_ok');
      await makeAdmin(admin);

      const res = await request.post('/api/auth/login').send({ username: admin.username, password: PASSWORD });
      expect(res.status).toBe(200);

      expect(notifiedTypes()).toContain('admin_login_success');
    });

    it('вход обычного пользователя не уведомляет', async () => {
      const user = await registerUser('login_plain');

      const res = await request.post('/api/auth/login').send({ username: user.username, password: PASSWORD });
      expect(res.status).toBe(200);

      expect(notifyAdmin).not.toHaveBeenCalled();
    });

    it('неверный пароль к админскому аккаунту уведомляет', async () => {
      const admin = await registerUser('login_fail');
      await makeAdmin(admin);

      const res = await request.post('/api/auth/login').send({ username: admin.username, password: 'wrong-password' });
      expect(res.status).toBe(401);

      expect(notifiedTypes()).toContain('admin_login_fail');
    });

    it('неверный пароль к обычному аккаунту не уведомляет', async () => {
      const user = await registerUser('login_fail_plain');

      const res = await request.post('/api/auth/login').send({ username: user.username, password: 'wrong-password' });
      expect(res.status).toBe(401);

      expect(notifyAdmin).not.toHaveBeenCalled();
    });
  });

  describe('вход в админ-панель (подтверждение пароля, R-32E)', () => {
    it('подтверждённый пароль уведомляет', async () => {
      const admin = await registerUser('reauth_ok');
      await makeAdmin(admin);

      const res = await request
        .post('/api/admin/reauth')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ password: PASSWORD });
      expect(res.status).toBe(200);

      expect(notifiedTypes()).toContain('admin_reauth_success');
    });

    it('неверный пароль в панели уведомляет', async () => {
      const admin = await registerUser('reauth_fail');
      await makeAdmin(admin);

      const res = await request
        .post('/api/admin/reauth')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ password: 'wrong-password' });
      expect(res.status).toBe(401);

      expect(notifiedTypes()).toContain('admin_reauth_fail');
    });

    it('исчерпанный лимит попыток уведомляет о блокировке', async () => {
      const admin = await registerUser('reauth_locked');
      await makeAdmin(admin);

      for (let attempt = 0; attempt < ADMIN_REAUTH_FAIL_LIMIT; attempt += 1) {
        await request
          .post('/api/admin/reauth')
          .set('Authorization', `Bearer ${admin.token}`)
          .send({ password: 'wrong-password' });
      }

      const lockedCalls = vi
        .mocked(notifyAdmin)
        .mock.calls.filter((call) => call[0] === 'admin_reauth_lock');
      expect(lockedCalls).toHaveLength(1);
    });
  });
});
