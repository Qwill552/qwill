import { normalizeIpCidr } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { ipFromHandshake } from '../src/lib/clientIp.js';
import { isIpBanned, loadIpBans } from '../src/services/ipBan.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const PASSWORD = 'password123';
const ADMIN_IP = '198.51.100.7';
const TARGET_IP = '203.0.113.47';
const NEIGHBOUR_IP = '203.0.113.200';

const createdUserIds: string[] = [];
const createdCidrs: string[] = [];

interface TestUser {
  token: string;
  userId: string;
  username: string;
}

async function registerUser(suffix: string, ip = ADMIN_IP): Promise<TestUser> {
  const username = `r32h_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .set('X-Forwarded-For', ip)
    .send({ username, password: PASSWORD, displayName: 'Проверка' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function makeAdmin(user: TestUser): Promise<void> {
  await prisma.user.update({ where: { id: user.userId }, data: { role: 'admin' } });
}

async function adminTicket(user: TestUser): Promise<string> {
  const res = await request
    .post('/api/admin/reauth')
    .set('Authorization', `Bearer ${user.token}`)
    .set('X-Forwarded-For', ADMIN_IP)
    .send({ password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.ticket as string;
}

async function banIp(
  admin: TestUser,
  ticket: string,
  body: { ip: string; subnet: boolean; reason: string; days: number | null },
) {
  const cidr = normalizeIpCidr(body.ip, body.subnet);
  if (cidr) createdCidrs.push(cidr);
  return request
    .post('/api/admin/ip-bans')
    .set('Authorization', `Bearer ${admin.token}`)
    .set('X-Admin-Ticket', ticket)
    .set('X-Forwarded-For', ADMIN_IP)
    .send(body);
}

describe('блокировка по IP (R-32H)', () => {
  afterEach(async () => {
    await prisma.ipBan.deleteMany({ where: { cidr: { in: createdCidrs } } });
    await loadIpBans();
  });

  afterAll(async () => {
    await prisma.adminAction.deleteMany({ where: { adminId: { in: createdUserIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('нормализует адрес в CIDR и не заводит вторую строку на тот же диапазон', async () => {
    const admin = await registerUser('dup');
    await makeAdmin(admin);
    const ticket = await adminTicket(admin);

    const first = await banIp(admin, ticket, { ip: TARGET_IP, subnet: false, reason: 'первая', days: 30 });
    expect(first.status).toBe(201);
    expect(first.body.cidr).toBe(`${TARGET_IP}/32`);

    const second = await banIp(admin, ticket, { ip: TARGET_IP, subnet: false, reason: 'вторая', days: null });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.reason).toBe('вторая');
    expect(second.body.expiresAt).toBeNull();

    const rows = await prisma.ipBan.findMany({ where: { cidr: `${TARGET_IP}/32` } });
    expect(rows).toHaveLength(1);
  });

  it('закрывает весь API с адреса, но не /api/health', async () => {
    const admin = await registerUser('closed');
    await makeAdmin(admin);
    const ticket = await adminTicket(admin);
    const victim = await registerUser('victim', TARGET_IP);

    expect((await banIp(admin, ticket, { ip: TARGET_IP, subnet: false, reason: 'тест', days: 1 })).status).toBe(201);

    const blocked = await request
      .get('/api/users/me')
      .set('Authorization', `Bearer ${victim.token}`)
      .set('X-Forwarded-For', TARGET_IP);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('IP_BANNED');

    const health = await request.get('/api/health').set('X-Forwarded-For', TARGET_IP);
    expect(health.status).toBe(200);

    const elsewhere = await request
      .get('/api/users/me')
      .set('Authorization', `Bearer ${victim.token}`)
      .set('X-Forwarded-For', NEIGHBOUR_IP);
    expect(elsewhere.status).toBe(200);
  });

  it('подделанный X-Forwarded-For не открывает и не закрывает доступ', async () => {
    const admin = await registerUser('spoof');
    await makeAdmin(admin);
    const ticket = await adminTicket(admin);
    const victim = await registerUser('spoofvictim', TARGET_IP);

    expect((await banIp(admin, ticket, { ip: TARGET_IP, subnet: false, reason: 'тест', days: 1 })).status).toBe(201);

    const tryToEscape = await request
      .get('/api/users/me')
      .set('Authorization', `Bearer ${victim.token}`)
      .set('X-Forwarded-For', `8.8.8.8, ${TARGET_IP}`);
    expect(tryToEscape.status).toBe(403);

    const tryToFrame = await request
      .get('/api/users/me')
      .set('Authorization', `Bearer ${victim.token}`)
      .set('X-Forwarded-For', `${TARGET_IP}, ${NEIGHBOUR_IP}`);
    expect(tryToFrame.status).toBe(200);
  });

  it('галочка подсети расширяет IPv4 до /24 и накрывает соседний адрес', async () => {
    const admin = await registerUser('subnet');
    await makeAdmin(admin);
    const ticket = await adminTicket(admin);
    const neighbour = await registerUser('neighbour', NEIGHBOUR_IP);

    const created = await banIp(admin, ticket, { ip: TARGET_IP, subnet: true, reason: 'подсеть', days: 7 });
    expect(created.status).toBe(201);
    expect(created.body.cidr).toBe('203.0.113.0/24');

    const blocked = await request
      .get('/api/users/me')
      .set('Authorization', `Bearer ${neighbour.token}`)
      .set('X-Forwarded-For', NEIGHBOUR_IP);
    expect(blocked.status).toBe(403);
  });

  it('нельзя заблокировать диапазон со своим собственным адресом', async () => {
    const admin = await registerUser('self');
    await makeAdmin(admin);
    const ticket = await adminTicket(admin);

    const single = await banIp(admin, ticket, { ip: ADMIN_IP, subnet: false, reason: 'сам себя', days: 1 });
    expect(single.status).toBe(400);

    const wide = await banIp(admin, ticket, { ip: '198.51.100.200', subnet: true, reason: 'сам себя', days: 1 });
    expect(wide.status).toBe(400);

    const rows = await prisma.ipBan.findMany({ where: { cidr: { in: [`${ADMIN_IP}/32`, '198.51.100.0/24'] } } });
    expect(rows).toHaveLength(0);
  });

  it('снятие проставляет liftedAt, строка остаётся и доступ возвращается', async () => {
    const admin = await registerUser('lift');
    await makeAdmin(admin);
    const ticket = await adminTicket(admin);
    const victim = await registerUser('liftvictim', TARGET_IP);

    const created = await banIp(admin, ticket, { ip: TARGET_IP, subnet: false, reason: 'тест', days: 1 });
    expect(created.status).toBe(201);

    const lifted = await request
      .delete(`/api/admin/ip-bans/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-Admin-Ticket', ticket)
      .set('X-Forwarded-For', ADMIN_IP);
    expect(lifted.status).toBe(200);
    expect(lifted.body.liftedAt).not.toBeNull();
    expect(lifted.body.active).toBe(false);

    const row = await prisma.ipBan.findUnique({ where: { id: created.body.id as string } });
    expect(row).not.toBeNull();

    const open = await request
      .get('/api/users/me')
      .set('Authorization', `Bearer ${victim.token}`)
      .set('X-Forwarded-For', TARGET_IP);
    expect(open.status).toBe(200);
  });

  it('срок истекает сам, без перезапуска и без обращения к базе', async () => {
    const cidr = `${TARGET_IP}/32`;
    createdCidrs.push(cidr);
    await prisma.ipBan.create({
      data: {
        cidr,
        reason: 'короткий срок',
        expiresAt: new Date(Date.now() + 80),
        createdById: 'test',
        createdByUsername: 'test',
      },
    });

    await loadIpBans();
    expect(isIpBanned(TARGET_IP)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(isIpBanned(TARGET_IP)).toBe(false);
  });

  it('каждая правка оставляет строку в журнале администрирования', async () => {
    const admin = await registerUser('journal');
    await makeAdmin(admin);
    const ticket = await adminTicket(admin);

    const created = await banIp(admin, ticket, { ip: TARGET_IP, subnet: false, reason: 'тест', days: 30 });
    expect(created.status).toBe(201);

    await request
      .delete(`/api/admin/ip-bans/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-Admin-Ticket', ticket)
      .set('X-Forwarded-For', ADMIN_IP);

    const entries = await prisma.adminAction.findMany({ where: { adminId: admin.userId } });
    const actions = entries.map((entry) => entry.action);
    expect(actions).toContain('ip.ban');
    expect(actions).toContain('ip.unban');

    const ban = entries.find((entry) => entry.action === 'ip.ban');
    expect(ban?.ip).toBe(ADMIN_IP);
    expect(ban?.detail).toContain(`${TARGET_IP}/32`);
  });

  it('обычный пользователь до списка блокировок не допущен', async () => {
    const user = await registerUser('plain');
    const res = await request
      .get('/api/admin/ip-bans')
      .set('Authorization', `Bearer ${user.token}`)
      .set('X-Forwarded-For', NEIGHBOUR_IP);
    expect(res.status).toBe(403);
  });

  it('адрес сокета берётся из крайнего правого элемента X-Forwarded-For', () => {
    expect(ipFromHandshake({ headers: { 'x-forwarded-for': `8.8.8.8, ${TARGET_IP}` }, address: '127.0.0.1' })).toBe(
      TARGET_IP,
    );
    expect(ipFromHandshake({ headers: {}, address: '127.0.0.1' })).toBe('127.0.0.1');
  });
});
