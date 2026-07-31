import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();
const request = supertest(app);

/** Каждый запуск — свой суффикс, чтобы не конфликтовать с прошлыми прогонами в общей dev-БД
 *  (тестовой БД/Docker в этом окружении нет — см. windows-dev-toolchain-constraints). */
const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdFileIds: string[] = [];

let sha256Counter = 0;
/** Валидный по формату (64 hex-символа) и уникальный в рамках прогона — sha256 в File уникален. */
function fakeSha256(): string {
  sha256Counter += 1;
  return `${Date.now().toString(16)}${sha256Counter.toString(16)}`.padEnd(64, '0').slice(0, 64);
}

async function registerUser(suffix: string, displayName: string): Promise<{ token: string; userId: string }> {
  const username = `stage8_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

describe('users profile/settings/search (этап 8)', () => {
  afterAll(async () => {
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('PATCH /users/me', () => {
    it('обновляет displayName', async () => {
      const { token } = await registerUser('profile', 'До правки');

      const res = await request
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'После правки' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('После правки');

      const again = await request.get('/api/users/me').set('Authorization', `Bearer ${token}`);
      expect(again.body.displayName).toBe('После правки');
    });
  });

  describe('POST /users/me/avatar', () => {
    it('сохраняет файл, avatarUrl меняется', async () => {
      const { token, userId } = await registerUser('avatar', 'Аватарный');

      const file = await prisma.file.create({
        data: {
          sha256: fakeSha256(),
          storedName: `test-${RUN_ID}-${userId}.png`,
          mimeType: 'image/png',
          size: 1024,
        },
      });
      createdFileIds.push(file.id);

      const res = await request
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .send({ fileId: file.id, sha256: file.sha256 });

      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toBe(`/api/files/${file.id}`);
    });

    it('отклоняет несовпадающий sha256', async () => {
      const { token } = await registerUser('avatar_bad', 'Плохой');

      const file = await prisma.file.create({
        data: {
          sha256: fakeSha256(),
          storedName: `test-bad-${RUN_ID}.png`,
          mimeType: 'image/png',
          size: 1024,
        },
      });
      createdFileIds.push(file.id);

      const res = await request
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .send({ fileId: file.id, sha256: fakeSha256() });

      expect(res.status).toBe(404);
    });
  });

  describe('настройки', () => {
    it('тема и размер шрифта сохраняются', async () => {
      const { token } = await registerUser('settings', 'Настройщик');

      const initial = await request.get('/api/users/me/settings').set('Authorization', `Bearer ${token}`);
      expect(initial.status).toBe(200);
      expect(initial.body).toEqual({ theme: 'system', fontSize: 'medium' });

      const updated = await request
        .patch('/api/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'dark', fontSize: 'large' });
      expect(updated.status).toBe(200);
      expect(updated.body).toEqual({ theme: 'dark', fontSize: 'large' });

      const again = await request.get('/api/users/me/settings').set('Authorization', `Bearer ${token}`);
      expect(again.body).toEqual({ theme: 'dark', fontSize: 'large' });
    });

    it('отклоняет некорректное значение темы', async () => {
      const { token } = await registerUser('settings_bad', 'Настройщик2');

      const res = await request
        .patch('/api/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'purple' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /users/search', () => {
    let token: string;
    let selfUsername: string;

    beforeAll(async () => {
      const self = await registerUser('search_me', 'Искатель');
      token = self.token;
      selfUsername = `stage8_${RUN_ID}_search_me`;

      await registerUser('search_target', 'Найденный');
    });

    it('находит по частичному username и не находит себя', async () => {
      const res = await request
        .get(`/api/users/search?q=stage8_${RUN_ID}_search`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const usernames: string[] = res.body.results.map((u: { username: string }) => u.username);
      expect(usernames).toContain(`stage8_${RUN_ID}_search_target`);
      expect(usernames).not.toContain(selfUsername);
    });

    it('отвечает 400 при запросе короче 2 символов', async () => {
      const res = await request.get('/api/users/search?q=a').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it('требует авторизацию', async () => {
      const res = await request.get(`/api/users/search?q=stage8_${RUN_ID}_search`);
      expect(res.status).toBe(401);
    });
  });
});
