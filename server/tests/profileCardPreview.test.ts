import supertest from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];

async function registerUser(suffix: string): Promise<{ token: string; userId: string }> {
  const res = await request
    .post('/api/auth/register')
    .send({ username: `r30b_${RUN_ID}_${suffix}`, password: 'password123', displayName: 'Визитка' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

async function savePreview(token: string, html: string): Promise<supertest.Response> {
  return request
    .put('/api/users/me/card/preview')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'text/html')
    .send(html);
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

describe('Предпросмотр визитки (R-30B)', () => {
  afterAll(async () => {
    await prisma.profileCard.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('отдаёт очищённый черновик по адресу, который не раскрывает автора', async () => {
    const { token, userId } = await registerUser('preview');

    const created = await savePreview(token, '<p>черновик</p><meta http-equiv="refresh" content="0">');
    expect(created.status).toBe(200);
    expect(created.body.url).toBe(`${env.CARD_ORIGIN}/c/preview/${created.body.token}/`);
    expect(created.body.token).not.toContain(userId);

    const res = await request.get(pathOf(created.body.url as string)).set('Host', env.cardHost);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<p>черновик</p>');
    expect(res.text).not.toContain('meta http-equiv');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('CSP собирается по владельцу токена, а не по токену', async () => {
    const { token, userId } = await registerUser('csp');
    const created = await savePreview(token, '<p>картинки</p>');

    const res = await request.get(pathOf(created.body.url as string)).set('Host', env.cardHost);
    expect(res.headers['content-security-policy']).toContain(`${env.CARD_ORIGIN}/c/${userId}/img/`);
    expect(res.headers['content-security-policy']).toContain("connect-src 'none'");
    expect(res.headers['content-security-policy']).toContain(`frame-ancestors ${env.APP_ORIGIN}`);
  });

  it('новый черновик вытесняет предыдущий', async () => {
    const { token } = await registerUser('replace');
    const first = await savePreview(token, '<p>первый</p>');
    const second = await savePreview(token, '<p>второй</p>');
    expect(second.body.token).not.toBe(first.body.token);

    const stale = await request.get(pathOf(first.body.url as string)).set('Host', env.cardHost);
    expect(stale.status).toBe(404);

    const live = await request.get(pathOf(second.body.url as string)).set('Host', env.cardHost);
    expect(live.text).toContain('<p>второй</p>');
  });

  it('выдуманного токена не существует', async () => {
    const res = await request.get('/c/preview/deadbeefdeadbeefdeadbeefdeadbeef/').set('Host', env.cardHost);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('через десять минут токен протухает', async () => {
    const { token } = await registerUser('expiry');
    const created = await savePreview(token, '<p>протухнет</p>');

    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
    try {
      const res = await request.get(pathOf(created.body.url as string)).set('Host', env.cardHost);
      expect(res.status).toBe(404);
    } finally {
      clock.mockRestore();
    }
  });

  it('черновик больше двух мегабайт не принимается', async () => {
    const { token } = await registerUser('toolarge');
    const res = await savePreview(token, 'x'.repeat(2 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });

  it('без входа черновик не создаётся', async () => {
    const res = await request.put('/api/users/me/card/preview').set('Content-Type', 'text/html').send('<p>чужое</p>');
    expect(res.status).toBe(401);
  });

  it('удаление визитки возвращает «О себе» в текстовый режим', async () => {
    const { token, userId } = await registerUser('delete');
    await request
      .put('/api/users/me/card')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/html')
      .send('<p>визитка</p>');
    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'html' });

    const deleted = await request.delete('/api/users/me/card').set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(204);

    const profile = await request.get(`/api/users/${userId}/profile`).set('Authorization', `Bearer ${token}`);
    expect(profile.body.bioMode).toBe('text');
    expect(profile.body.cardUrl).toBeNull();

    const draft = await request.get('/api/users/me/card').set('Authorization', `Bearer ${token}`);
    expect(draft.text).toBe('');
  });
});
