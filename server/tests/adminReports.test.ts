import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';

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

async function registerUser(suffix: string, displayName: string): Promise<TestUser> {
  const username = `r32d_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: PASSWORD, displayName });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

async function makeAdmin(user: TestUser): Promise<void> {
  await prisma.user.update({ where: { id: user.userId }, data: { role: 'admin' } });
}

async function fileReport(
  reporter: TestUser,
  body: Record<string, unknown>,
): Promise<{ status: number; body: { id?: string } }> {
  const res = await request.post('/api/reports').set('Authorization', `Bearer ${reporter.token}`).send(body);
  return res;
}

describe('разбор жалоб (R-32D)', () => {
  afterAll(async () => {
    await prisma.report.deleteMany({ where: { reporterId: { in: createdUserIds } } });
    await prisma.adminAction.deleteMany({ where: { adminId: { in: createdUserIds } } });
    await prisma.chatMember.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('группирует несколько жалоб на одну визитку в одну строку с бейджем', async () => {
    const admin = await registerUser('groupadmin', 'Разборщик');
    await makeAdmin(admin);
    const target = await registerUser('cardtarget', 'Владелец визитки');
    const reporters = await Promise.all(
      [1, 2, 3, 4].map((i) => registerUser(`cardreporter${i}`, `Жалобщик ${i}`)),
    );

    for (const reporter of reporters) {
      const res = await fileReport(reporter, {
        targetUserId: target.userId,
        kind: 'card',
        comment: 'мерцающий экран',
      });
      expect(res.status).toBe(201);
    }

    const list = await request.get('/api/admin/reports').set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    const groups = list.body.filter((g: { targetUserId: string }) => g.targetUserId === target.userId);
    expect(groups.length).toBe(1);
    expect(groups[0].openCount).toBe(4);
    expect(groups[0].hasNew).toBe(true);
    expect(groups[0].reports.length).toBe(4);
  });

  it('группирует жалобы на сообщение по чату, а не по пользователю', async () => {
    const admin = await registerUser('msgadmin', 'Разборщик сообщений');
    await makeAdmin(admin);
    const alice = await registerUser('msgalice', 'Маша');
    const bob = await registerUser('msgbob', 'Пётр');
    const { chatId } = await getOrCreatePrivateChat(alice.userId, bob.username);

    const first = await fileReport(alice, {
      targetUserId: bob.userId,
      kind: 'message',
      targetChatId: chatId,
      targetMessageId: 1,
      comment: 'угрозы в личке',
    });
    expect(first.status).toBe(201);

    const list = await request.get('/api/admin/reports').set('Authorization', `Bearer ${admin.token}`);
    const group = list.body.find((g: { targetChatId: string | null }) => g.targetChatId === chatId);
    expect(group).toBeDefined();
    expect(group.kind).toBe('message');
    expect(group.chatTitle).toContain('Маша');
    expect(group.chatTitle).toContain('Пётр');
  });

  it('жалоба на сообщение без targetChatId/targetMessageId отклоняется', async () => {
    const reporter = await registerUser('msgbadreporter', 'Жалобщик');
    const target = await registerUser('msgbadtarget', 'Цель');

    const res = await fileReport(reporter, { targetUserId: target.userId, kind: 'message', comment: 'спам' });
    expect(res.status).toBe(400);
  });

  it('«Взять в работу» и «Закрыть» действуют на всю группу разом', async () => {
    const admin = await registerUser('workadmin', 'Разборщик работы');
    await makeAdmin(admin);
    const target = await registerUser('worktarget', 'Цель работы');
    const reporters = await Promise.all([1, 2].map((i) => registerUser(`workreporter${i}`, `Жалобщик ${i}`)));

    const reportIds: string[] = [];
    for (const reporter of reporters) {
      const res = await fileReport(reporter, { targetUserId: target.userId, kind: 'profile', comment: 'спам' });
      reportIds.push(res.body.id as string);
    }

    const working = await request
      .patch(`/api/admin/reports/${reportIds[0]}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'working' });
    expect(working.status).toBe(204);

    const afterWorking = await prisma.report.findMany({ where: { id: { in: reportIds } } });
    expect(afterWorking.every((r) => r.status === 'working')).toBe(true);

    const closeEmpty = await request
      .patch(`/api/admin/reports/${reportIds[0]}/close`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resolution: '' });
    expect(closeEmpty.status).toBe(400);

    const close = await request
      .patch(`/api/admin/reports/${reportIds[0]}/close`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resolution: 'Предупреждение вынесено' });
    expect(close.status).toBe(204);

    const afterClose = await prisma.report.findMany({ where: { id: { in: reportIds } } });
    expect(afterClose.every((r) => r.status === 'closed')).toBe(true);
    expect(afterClose.every((r) => r.resolution === 'Предупреждение вынесено')).toBe(true);
    expect(afterClose.every((r) => r.closedById === admin.userId)).toBe(true);

    const actions = await prisma.adminAction.findMany({
      where: { adminId: admin.userId, targetUserId: target.userId },
    });
    expect(actions.map((a) => a.action).sort()).toEqual(['report.close', 'report.working']);

    const closeAction = actions.find((a) => a.action === 'report.close');
    expect(JSON.parse(closeAction?.detail ?? '{}').count).toBe(2);

    const openList = await request
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(openList.body.some((g: { targetUserId: string }) => g.targetUserId === target.userId)).toBe(false);

    const closedList = await request
      .get('/api/admin/reports?view=closed')
      .set('Authorization', `Bearer ${admin.token}`);
    const closedGroup = closedList.body.find((g: { targetUserId: string }) => g.targetUserId === target.userId);
    expect(closedGroup).toBeDefined();
    expect(closedGroup.resolution).toBe('Предупреждение вынесено');
  });

  it('закрытие уже закрытой группы отвечает 404', async () => {
    const admin = await registerUser('reclosadmin', 'Повторный разбор');
    await makeAdmin(admin);
    const target = await registerUser('reclostarget', 'Цель');
    const reporter = await registerUser('reclosreporter', 'Жалобщик');

    const filed = await fileReport(reporter, { targetUserId: target.userId, kind: 'profile', comment: 'спам' });
    const reportId = filed.body.id as string;

    await request
      .patch(`/api/admin/reports/${reportId}/close`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resolution: 'Разобрано' });

    const again = await request
      .patch(`/api/admin/reports/${reportId}/close`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resolution: 'Ещё раз' });
    expect(again.status).toBe(404);
  });

  it('обычный пользователь получает 403 на разборе жалоб', async () => {
    const user = await registerUser('plainuser', 'Обычный');
    const target = await registerUser('plaintarget', 'Цель');
    const reporter = await registerUser('plainreporter', 'Жалобщик');

    const filed = await fileReport(reporter, { targetUserId: target.userId, kind: 'profile', comment: 'спам' });
    const reportId = filed.body.id as string;

    const list = await request.get('/api/admin/reports').set('Authorization', `Bearer ${user.token}`);
    expect(list.status).toBe(403);

    const working = await request
      .patch(`/api/admin/reports/${reportId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ status: 'working' });
    expect(working.status).toBe(403);
  });
});
