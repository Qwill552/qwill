import { SESSION_MODE_BODY, SESSION_MODE_HEADER } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { prisma } from '../src/db/prisma.js';
import { REFRESH_COOKIE } from '../src/http/authCookies.js';

const request = supertest(createApp());
const RUN_ID = Date.now().toString(36);
const PASSWORD = 'password123';
const createdUserIds: string[] = [];

function setCookiesOf(res: { headers: unknown }): string[] {
  const header = (res.headers as Record<string, string[] | string | undefined>)['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

function cookieRefreshToken(res: { headers: unknown }): string {
  const cookie = setCookiesOf(res).find((value) => value.startsWith(`${REFRESH_COOKIE}=`)) as string;
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1).split(';')[0]);
}

interface BodySession {
  userId: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

function usernameFor(suffix: string): string {
  return `nat4_${RUN_ID}_${suffix}`;
}

async function registerWithBody(suffix: string): Promise<BodySession> {
  const username = usernameFor(suffix);
  const res = await request
    .post('/api/auth/register')
    .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
    .send({ username, password: PASSWORD, displayName: 'Натив', ...CURRENT_LEGAL_VERSIONS });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return {
    userId: res.body.user.id as string,
    username,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

function refreshWithBody(refreshToken: string) {
  return request
    .post('/api/auth/refresh')
    .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
    .send({ refreshToken });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe('сессия телом для нативного клиента (НАТ-4)', () => {
  it('регистрация с заголовком отдаёт refresh-токен в теле и не ставит кук', async () => {
    const res = await request
      .post('/api/auth/register')
      .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
      .send({ username: usernameFor('reg'), password: PASSWORD, displayName: 'Натив', ...CURRENT_LEGAL_VERSIONS });

    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id as string);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(setCookiesOf(res)).toHaveLength(0);
  });

  it('вход с заголовком отдаёт refresh-токен в теле и не ставит кук', async () => {
    const session = await registerWithBody('login');

    const res = await request
      .post('/api/auth/login')
      .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
      .send({ username: session.username, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken).not.toBe(session.refreshToken);
    expect(setCookiesOf(res)).toHaveLength(0);
  });

  it('вход без заголовка ведёт себя как раньше: токен в куке, в теле его нет', async () => {
    const session = await registerWithBody('weblogin');

    const res = await request.post('/api/auth/login').send({ username: session.username, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    expect(cookieRefreshToken(res)).toBeTruthy();
  });

  it('продление телом ротирует токен и принимает предыдущее поколение ещё раз', async () => {
    const session = await registerWithBody('rotate');

    const rotated = await refreshWithBody(session.refreshToken);
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(session.refreshToken);
    expect(setCookiesOf(rotated)).toHaveLength(0);

    const retry = await refreshWithBody(session.refreshToken);
    expect(retry.status).toBe(200);
    expect(typeof retry.body.refreshToken).toBe('string');
  });

  it('с заголовком кука не читается: продление одной кукой — 401', async () => {
    const web = await request
      .post('/api/auth/register')
      .send({ username: usernameFor('cookieonly'), password: PASSWORD, displayName: 'Веб', ...CURRENT_LEGAL_VERSIONS });
    expect(web.status).toBe(201);
    createdUserIds.push(web.body.user.id as string);

    const res = await request
      .post('/api/auth/refresh')
      .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
      .set('Cookie', `${REFRESH_COOKIE}=${cookieRefreshToken(web)}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('выход телом удаляет сессию', async () => {
    const session = await registerWithBody('logout');

    const res = await request
      .post('/api/auth/logout')
      .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
      .send({ refreshToken: session.refreshToken });

    expect(res.status).toBe(204);
    expect(setCookiesOf(res)).toHaveLength(0);
    expect(await prisma.session.count({ where: { userId: session.userId } })).toBe(0);
    expect((await refreshWithBody(session.refreshToken)).status).toBe(401);
  });

  it('смена пароля с токеном в теле оставляет текущую сессию и завершает остальные', async () => {
    const current = await registerWithBody('password');
    const other = await request
      .post('/api/auth/login')
      .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
      .send({ username: current.username, password: PASSWORD });
    expect(other.status).toBe(200);

    const res = await request
      .post('/api/auth/password')
      .set(SESSION_MODE_HEADER, SESSION_MODE_BODY)
      .set('Authorization', `Bearer ${current.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'another-password-1', refreshToken: current.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.terminatedSessions).toBe(1);
    expect((await refreshWithBody(current.refreshToken)).status).toBe(200);
    expect((await refreshWithBody(other.body.refreshToken as string)).status).toBe(401);
  });
});
