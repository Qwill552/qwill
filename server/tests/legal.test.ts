import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const PASSWORD = 'password123';
const createdUserIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string; token: string }> {
  const username = `legal_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .set('User-Agent', 'legal-test-agent')
    .send({
      username,
      password: PASSWORD,
      displayName: 'Проверка',
      ...CURRENT_LEGAL_VERSIONS,
    });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username, token: res.body.accessToken as string };
}

describe('согласие при регистрации (R-31)', () => {
  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('GET /api/legal/current отдаёт текущие версии без авторизации', async () => {
    const res = await request.get('/api/legal/current');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(CURRENT_LEGAL_VERSIONS);
  });

  it('GET /api/legal/:doc/:version отдаёт документ, неизвестная версия — 404', async () => {
    const terms = await request.get(`/api/legal/terms/${CURRENT_LEGAL_VERSIONS.termsVersion}`);
    expect(terms.status).toBe(200);
    expect(terms.body.title).toBe('Пользовательское соглашение');
    expect(terms.body.content).toContain('Пользовательское соглашение');

    const missing = await request.get('/api/legal/terms/99.9');
    expect(missing.status).toBe(404);
  });

  it('регистрация без версий документов отклоняется как невалидная', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ username: `legal_${RUN_ID}_novers`, password: PASSWORD, displayName: 'Без согласия' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('регистрация с устаревшей версией документа отклоняется', async () => {
    const res = await request.post('/api/auth/register').send({
      username: `legal_${RUN_ID}_stale`,
      password: PASSWORD,
      displayName: 'Отстал',
      termsVersion: '0.1',
      privacyVersion: CURRENT_LEGAL_VERSIONS.privacyVersion,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LEGAL_VERSION_OUTDATED');
  });

  it('успешная регистрация фиксирует версии, время, IP и User-Agent', async () => {
    const user = await registerUser('accepted');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect(stored.termsVersion).toBe(CURRENT_LEGAL_VERSIONS.termsVersion);
    expect(stored.privacyVersion).toBe(CURRENT_LEGAL_VERSIONS.privacyVersion);
    expect(stored.termsAcceptedAt).not.toBeNull();
    expect(stored.signupIp).not.toBeNull();
    expect(stored.signupUserAgent).not.toBeNull();

    const res = await request.get('/api/users/me').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.pendingConsent).toBeNull();
  });

  it('пользователь без принятой текущей версии видит pendingConsent, после /legal/accept — нет', async () => {
    const user = await registerUser('outdated');
    await prisma.user.update({ where: { id: user.userId }, data: { termsVersion: '0.1' } });

    const before = await request.get('/api/users/me').set('Authorization', `Bearer ${user.token}`);
    expect(before.status).toBe(200);
    expect(before.body.pendingConsent).toEqual({ terms: true, privacy: false });

    const staleAccept = await request
      .post('/api/legal/accept')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ termsVersion: '0.1', privacyVersion: CURRENT_LEGAL_VERSIONS.privacyVersion });
    expect(staleAccept.status).toBe(409);
    expect(staleAccept.body.error.code).toBe('LEGAL_VERSION_OUTDATED');

    const accept = await request
      .post('/api/legal/accept')
      .set('Authorization', `Bearer ${user.token}`)
      .send(CURRENT_LEGAL_VERSIONS);
    expect(accept.status).toBe(200);
    expect(accept.body.pendingConsent).toBeNull();

    const after = await request.get('/api/users/me').set('Authorization', `Bearer ${user.token}`);
    expect(after.body.pendingConsent).toBeNull();
  });
});
