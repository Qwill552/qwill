import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../src/http/authCookies.js';

const request = supertest(createApp());
const RUN_ID = Date.now().toString(36);
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
  refreshToken: string;
  csrfCookie: string;
  csrfToken: string;
  cookieHeader: string;
}

function sessionFrom(res: { headers: unknown; body: unknown }): Session {
  const cookies = setCookiesOf(res);
  const refreshToken = valueOf(findSetCookie(cookies, REFRESH_COOKIE) as string);
  const csrfCookie = valueOf(findSetCookie(cookies, CSRF_COOKIE) as string);
  return {
    refreshToken,
    csrfCookie,
    csrfToken: (res.body as { csrfToken: string }).csrfToken,
    cookieHeader: `${REFRESH_COOKIE}=${refreshToken}; ${CSRF_COOKIE}=${csrfCookie}`,
  };
}

async function openSession(suffix: string): Promise<Session> {
  const res = await request.post('/api/auth/register').send({
    username: `rot_${RUN_ID}_${suffix}`,
    password: 'password123',
    displayName: 'Ротация',
    ...CURRENT_LEGAL_VERSIONS,
  });
  expect(res.status).toBe(201);
  createdUserIds.push((res.body as { user: { id: string } }).user.id);
  return sessionFrom(res);
}

function refreshWith(session: Session, options: { csrf?: string | null } = {}) {
  const req = request.post('/api/auth/refresh').set('Cookie', session.cookieHeader);
  const csrf = options.csrf === undefined ? session.csrfToken : options.csrf;
  if (csrf !== null) req.set(CSRF_HEADER, csrf);
  return req.send({});
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe('ротация refresh-токена переживает потерю ответа', () => {
  it('токен предыдущего поколения принимается — клиент, не сохранивший ответ, не разлогинивается', async () => {
    const first = await openSession('previous');

    const rotated = await refreshWith(first);
    expect(rotated.status).toBe(200);

    const retry = await refreshWith(first);
    expect(retry.status).toBe(200);
    expect(sessionFrom(retry).refreshToken).not.toBe(first.refreshToken);
  });

  it('поколение через одно уже не принимается — память ровно на один шаг назад', async () => {
    const first = await openSession('twoback');

    const second = sessionFrom(await refreshWith(first));
    await refreshWith(second);

    const retry = await refreshWith(first);
    expect(retry.status).toBe(401);
  });

  it('свежий токен работает после того, как старым уже воспользовались', async () => {
    const first = await openSession('bothlive');
    const second = sessionFrom(await refreshWith(first));

    expect((await refreshWith(first)).status).toBe(200);
    expect((await refreshWith(second)).status).toBe(200);
  });
});

describe('CSRF при обновлении сессии', () => {
  it('значение CSRF не меняется при refresh — расходиться с кукой нечему', async () => {
    const session = await openSession('stablecsrf');

    const rotated = sessionFrom(await refreshWith(session));
    expect(rotated.csrfToken).toBe(session.csrfToken);
    expect(rotated.csrfCookie).toBe(session.csrfCookie);
  });

  it('отсутствие заголовка не разлогинивает: сессия жива, CSRF выдаётся заново', async () => {
    const session = await openSession('nocsrfheader');

    const res = await refreshWith(session, { csrf: null });
    expect(res.status).toBe(200);
    expect((res.body as { csrfToken: string }).csrfToken).toHaveLength(43);
  });

  it('подделанный заголовок при живой куке по-прежнему отклоняется', async () => {
    const session = await openSession('badcsrfheader');

    const res = await refreshWith(session, { csrf: 'a'.repeat(session.csrfToken.length) });
    expect(res.status).toBe(403);
  });

  it('отказ по CSRF не гасит куки сессии — следующий запрос ещё может пройти', async () => {
    const session = await openSession('keepcookies');

    const denied = await refreshWith(session, { csrf: 'b'.repeat(session.csrfToken.length) });
    expect(denied.status).toBe(403);
    expect(findSetCookie(setCookiesOf(denied), REFRESH_COOKIE)).toBeUndefined();

    expect((await refreshWith(session)).status).toBe(200);
  });
});
