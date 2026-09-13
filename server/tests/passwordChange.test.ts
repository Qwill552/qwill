import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { REFRESH_COOKIE } from '../src/http/authCookies.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const PASSWORD = 'password123';
const createdUserIds: string[] = [];

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

interface Session {
  token: string;
  refreshToken: string;
}

async function registerUser(suffix: string): Promise<{ userId: string; username: string; session: Session }> {
  const username = `r31_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: PASSWORD, displayName: 'Проверка' , ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);

  const refresh = findSetCookie(setCookiesOf(res), REFRESH_COOKIE) as string;
  return {
    userId: res.body.user.id as string,
    username,
    session: { token: res.body.accessToken as string, refreshToken: valueOf(refresh) },
  };
}

async function loginSession(username: string, password = PASSWORD): Promise<Session> {
  const res = await request.post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  const refresh = findSetCookie(setCookiesOf(res), REFRESH_COOKIE) as string;
  return { token: res.body.accessToken as string, refreshToken: valueOf(refresh) };
}

describe('смена пароля (R-31)', () => {
  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('неверный текущий пароль отклоняется 400, а не 401, из аккаунта не выбрасывает', async () => {
    const user = await registerUser('wrongcurrent');

    const res = await request
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${user.session.token}`)
      .set('Cookie', `${REFRESH_COOKIE}=${user.session.refreshToken}`)
      .send({ currentPassword: 'not-the-password', newPassword: 'another-password-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');

    const stillThere = await prisma.session.findFirst({ where: { userId: user.userId } });
    expect(stillThere).not.toBeNull();
  });

  it('новый пароль, равный старому, отклоняется', async () => {
    const user = await registerUser('samepassword');

    const res = await request
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${user.session.token}`)
      .set('Cookie', `${REFRESH_COOKIE}=${user.session.refreshToken}`)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.newPassword).toBeDefined();
  });

  it('завершает сеансы на других устройствах, текущий остаётся живым', async () => {
    const user = await registerUser('sessions');
    const other = await loginSession(user.username);

    const before = await prisma.session.count({ where: { userId: user.userId } });
    expect(before).toBe(2);

    const res = await request
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${user.session.token}`)
      .set('Cookie', `${REFRESH_COOKIE}=${user.session.refreshToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-password-1' });

    expect(res.status).toBe(200);
    expect(res.body.terminatedSessions).toBe(1);

    const remaining = await prisma.session.findMany({ where: { userId: user.userId } });
    expect(remaining).toHaveLength(1);

    const otherRefresh = await request.post('/api/auth/refresh').send({ refreshToken: other.refreshToken });
    expect(otherRefresh.status).toBe(401);

    const currentRefresh = await request.post('/api/auth/refresh').send({ refreshToken: user.session.refreshToken });
    expect(currentRefresh.status).toBe(200);
  });

  it('после смены: вход по новому паролю работает, по старому — нет', async () => {
    const user = await registerUser('login');

    const change = await request
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${user.session.token}`)
      .set('Cookie', `${REFRESH_COOKIE}=${user.session.refreshToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'yet-another-password-1' });
    expect(change.status).toBe(200);

    const oldLogin = await request.post('/api/auth/login').send({ username: user.username, password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request
      .post('/api/auth/login')
      .send({ username: user.username, password: 'yet-another-password-1' });
    expect(newLogin.status).toBe(200);
  });
});
