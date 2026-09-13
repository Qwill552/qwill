import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

async function registerUser(suffix: string): Promise<{ token: string; userId: string }> {
  const res = await request
    .post('/api/auth/register')
    .send({ username: `r30_${RUN_ID}_${suffix}`, password: 'password123', displayName: 'Визитка' , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

async function saveCard(token: string, html: string): Promise<supertest.Response> {
  return request
    .put('/api/users/me/card')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'text/html')
    .send(html);
}

describe('HTML-визитка (R-30)', () => {
  afterAll(async () => {
    await prisma.profileCard.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('сохраняет визитку очищенной и возвращает её текстом, а не HTML', async () => {
    const { token } = await registerUser('save');

    const saved = await saveCard(token, '<p>Привет</p><meta http-equiv="refresh" content="0">');
    expect(saved.status).toBe(200);
    expect(saved.text).toContain('<p>Привет</p>');
    expect(saved.text).not.toContain('meta');

    const read = await request.get('/api/users/me/card').set('Authorization', `Bearer ${token}`);
    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toContain('text/plain');
    expect(read.headers['x-content-type-options']).toBe('nosniff');
    expect(read.headers['content-disposition']).toContain('attachment');
  });

  it('отклоняет тело больше двух мегабайт', async () => {
    const { token } = await registerUser('toolarge');
    const res = await saveCard(token, 'x'.repeat(2 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });

  it('в профиле cardUrl появляется только в режиме html', async () => {
    const { token, userId } = await registerUser('mode');
    await saveCard(token, '<b>карточка</b>');

    const inTextMode = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
    expect(inTextMode.body.bioMode).toBe('text');
    expect(inTextMode.body.cardUrl).toBeNull();

    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'html' });

    const inHtmlMode = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
    expect(inHtmlMode.body.bioMode).toBe('html');
    expect(inHtmlMode.body.cardUrl).toContain(`${env.CARD_ORIGIN}/c/${userId}/`);
  });

  it('выключенная админом визитка перестаёт отдаваться, черновик остаётся', async () => {
    const { token, userId } = await registerUser('disabled');
    await saveCard(token, '<b>карточка</b>');
    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'html' });
    await prisma.user.update({ where: { id: userId }, data: { cardDisabled: true } });

    const profile = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
    expect(profile.body.cardUrl).toBeNull();

    const draft = await request.get('/api/users/me/card').set('Authorization', `Bearer ${token}`);
    expect(draft.text).toContain('карточка');
  });

  it('переключение режима туда-обратно не стирает ни текст, ни визитку', async () => {
    const { token, userId } = await registerUser('drafts');
    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bio: 'обычный текст' });
    await saveCard(token, '<i>визитка</i>');

    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'html' });
    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'text' });

    const profile = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
    expect(profile.body.bio).toBe('обычный текст');
    const draft = await request.get('/api/users/me/card').set('Authorization', `Bearer ${token}`);
    expect(draft.text).toContain('визитка');
  });

  describe('домен песочницы', () => {
    it('отдаёт документ с песочной CSP и не требует входа', async () => {
      const { token, userId } = await registerUser('sandbox');
      await saveCard(token, '<h1>визитка</h1><script>1</script>');
      await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'html' });

      const res = await request.get(`/c/${userId}/`).set('Host', env.cardHost);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("connect-src 'none'");
      expect(res.headers['content-security-policy']).toContain(`/c/${userId}/img/`);
      expect(res.headers['content-security-policy']).toContain(`frame-ancestors ${env.APP_ORIGIN}`);
      expect(res.text).toContain('<h1>визитка</h1>');
      expect(res.text).toContain('<script>1</script>');
    });

    it('в режиме text отдаёт пустой документ, а не чужой черновик', async () => {
      const { token, userId } = await registerUser('sandboxtext');
      await saveCard(token, '<h1>секрет</h1>');

      const res = await request.get(`/c/${userId}/`).set('Host', env.cardHost);
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('секрет');
    });

    it('никакого API на домене песочницы нет', async () => {
      const res = await request.get('/api/users/me').set('Host', env.cardHost);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('на домене приложения маршрута /c/ нет', async () => {
      const { userId } = await registerUser('appdomain');
      const res = await request.get(`/c/${userId}/`);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
    });
  });
});
