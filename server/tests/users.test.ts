import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { getServiceUser } from '../src/services/announcements.js';

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
    .send({ username, password: 'password123', displayName , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

describe('users profile/settings (этап 8)', () => {
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
        .send({ displayName: 'После правки' , ...CURRENT_LEGAL_VERSIONS });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('После правки');

      const again = await request.get('/api/users/me').set('Authorization', `Bearer ${token}`);
      expect(again.body.displayName).toBe('После правки');
    });
  });

  describe('поля профиля (R-28)', () => {
    it('записывает и стирает phone/birthday/bio', async () => {
      const { token, userId } = await registerUser('fields', 'Полевой');

      const filled = await request
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '+7 900 000-00-00', birthday: '1998-12-15', bio: 'Тестовое био' });
      expect(filled.status).toBe(200);

      const profile = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
      expect(profile.status).toBe(200);
      expect(profile.body.phone).toBe('+7 900 000-00-00');
      expect(profile.body.birthday).toBe('1998-12-15');
      expect(profile.body.bio).toBe('Тестовое био');

      const cleared = await request
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: null });
      expect(cleared.status).toBe(200);

      const again = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
      expect(again.body.bio).toBeNull();
      expect(again.body.phone).toBe('+7 900 000-00-00');
    });

    it('у нового аккаунта поля профиля пустые', async () => {
      const { token, userId } = await registerUser('fields_new', 'Новичок');

      const profile = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
      expect(profile.status).toBe(200);
      expect(profile.body.phone).toBeNull();
      expect(profile.body.birthday).toBeNull();
      expect(profile.body.bio).toBeNull();
    });

    it('отклоняет bio длиннее 89 символов', async () => {
      const { token } = await registerUser('fields_bio', 'Многословный');

      const res = await request
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'a'.repeat(90) });

      expect(res.status).toBe(400);
    });

    it('отклоняет телефон из букв', async () => {
      const { token } = await registerUser('fields_phone', 'Буквенный');

      const res = await request
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: 'abcdefgh' });

      expect(res.status).toBe(400);
    });

    it('день рождения не съезжает на сутки', async () => {
      const { token, userId } = await registerUser('fields_bday', 'Именинник');

      await request
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ birthday: '1998-01-01' });

      const profile = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
      expect(profile.body.birthday).toBe('1998-01-01');
    });

    it('404 на профиле сервисного аккаунта', async () => {
      const { token } = await registerUser('fields_service', 'Проверяющий');
      const service = await getServiceUser();

      const res = await request.get(`/api/users/${service.id}/profile`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /users/by-username/:username/profile (D-10)', () => {
    it('отдаёт профиль по нику, без разницы в регистре', async () => {
      const owner = await registerUser('byname', 'Ссылочный');
      const guest = await registerUser('bynameg', 'Гость');
      const username = `stage8_${RUN_ID}_byname`;

      const res = await request
        .get(`/api/users/by-username/${username.toUpperCase()}/profile`)
        .set('Authorization', `Bearer ${guest.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(owner.userId);
      expect(res.body.username).toBe(username);
    });

    it('отвечает 404 на несуществующий ник', async () => {
      const { token } = await registerUser('byname404', 'Искатель');

      const res = await request
        .get(`/api/users/by-username/nobody_${RUN_ID}/profile`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('не пускает без токена', async () => {
      const res = await request.get(`/api/users/by-username/stage8_${RUN_ID}_byname/profile`);
      expect(res.status).toBe(401);
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
    it('тема, размер шрифта и оформление сохраняются', async () => {
      const { token } = await registerUser('settings', 'Настройщик');

      const initial = await request.get('/api/users/me/settings').set('Authorization', `Bearer ${token}`);
      expect(initial.status).toBe(200);
      expect(initial.body).toEqual({ theme: 'system', fontSize: 'medium', surface: 'glass' });

      const updated = await request
        .patch('/api/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'dark', fontSize: 'large', surface: 'solid' });
      expect(updated.status).toBe(200);
      expect(updated.body).toEqual({ theme: 'dark', fontSize: 'large', surface: 'solid' });

      const again = await request.get('/api/users/me/settings').set('Authorization', `Bearer ${token}`);
      expect(again.body).toEqual({ theme: 'dark', fontSize: 'large', surface: 'solid' });
    });

    it('отклоняет некорректное оформление', async () => {
      const { token } = await registerUser('settings_surface', 'Настройщик3');

      const res = await request
        .patch('/api/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ surface: 'frosted' });

      expect(res.status).toBe(400);
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
});
