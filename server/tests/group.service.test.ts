import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { createGroupChat } from '../src/services/chat.js';
import { leaveGroup, transferOwnership, updateMemberRole } from '../src/services/group.js';

/** Unit-тесты group.service по чек-листу этапа 7-D (STAGES.md). */

const app = createApp();
const request = supertest(app);

/** Каждый запуск — свой суффикс, чтобы не конфликтовать с прошлыми прогонами в общей dev-БД
 *  (тестовой БД/Docker в этом окружении нет — см. windows-dev-toolchain-constraints). */
const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string }> {
  const username = `grp_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username };
}

/** creatorId становится OWNER, memberUsernames — MEMBER (порядок = порядок вступления/joinedAt). */
async function createGroup(creatorId: string, title: string, memberUsernames: string[]): Promise<string> {
  const { chatId } = await createGroupChat(creatorId, title, memberUsernames);
  createdChatIds.push(chatId);
  return chatId;
}

async function makeOlder(chatId: string, userId: string): Promise<void> {
  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { joinedAt: new Date(Date.now() - 60 * 60 * 1000) },
  });
}

function roleOf(chatId: string, userId: string) {
  return prisma.chatMember
    .findUnique({ where: { chatId_userId: { chatId, userId } } })
    .then((member) => member?.role ?? null);
}

describe('group.service (этап 7, чек-лист 7-D)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('leaveGroup', () => {
    it('единственный OWNER уходит, есть ADMIN → права переходят старейшему ADMIN', async () => {
      const owner = await registerUser('lg1_owner');
      const admin = await registerUser('lg1_admin');
      const member = await registerUser('lg1_member');
      const chatId = await createGroup(owner.userId, 'Группа 1', [admin.username, member.username]);
      await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: admin.userId } },
        data: { role: 'ADMIN' },
      });

      await leaveGroup(chatId, owner.userId);

      expect(await roleOf(chatId, admin.userId)).toBe('OWNER');
      expect(await roleOf(chatId, member.userId)).toBe('MEMBER');
      expect(await roleOf(chatId, owner.userId)).toBeNull();
    });

    it('единственный OWNER уходит, ADMIN нет → права переходят старейшему MEMBER', async () => {
      const owner = await registerUser('lg2_owner');
      const memberOld = await registerUser('lg2_member_old');
      const memberNew = await registerUser('lg2_member_new');
      const chatId = await createGroup(owner.userId, 'Группа 2', [memberOld.username, memberNew.username]);
      await makeOlder(chatId, memberOld.userId);

      await leaveGroup(chatId, owner.userId);

      expect(await roleOf(chatId, memberOld.userId)).toBe('OWNER');
      expect(await roleOf(chatId, memberNew.userId)).toBe('MEMBER');
    });

    it('последний участник уходит → чат удаляется', async () => {
      const owner = await registerUser('lg3_owner');
      const temp = await registerUser('lg3_temp');
      const chatId = await createGroup(owner.userId, 'Группа 3', [temp.username]);

      await leaveGroup(chatId, temp.userId);
      await leaveGroup(chatId, owner.userId);

      expect(await prisma.chat.findUnique({ where: { id: chatId } })).toBeNull();
    });
  });

  describe('transferOwnership', () => {
    it('requesterId не OWNER → 403 FORBIDDEN, роли не меняются', async () => {
      const owner = await registerUser('to1_owner');
      const member = await registerUser('to1_member');
      const other = await registerUser('to1_other');
      const chatId = await createGroup(owner.userId, 'Группа TO', [member.username, other.username]);

      await expect(transferOwnership(chatId, other.username, member.userId)).rejects.toMatchObject({
        httpStatus: 403,
        code: 'FORBIDDEN',
      });

      expect(await roleOf(chatId, owner.userId)).toBe('OWNER');
      expect(await roleOf(chatId, other.userId)).toBe('MEMBER');
    });
  });

  describe('updateMemberRole', () => {
    it('нельзя понизить единственного OWNER (даже себя)', async () => {
      const owner = await registerUser('umr1_owner');
      const member = await registerUser('umr1_member');
      const chatId = await createGroup(owner.userId, 'Группа UMR', [member.username]);

      await expect(updateMemberRole(chatId, owner.userId, 'ADMIN', owner.userId)).rejects.toMatchObject({
        httpStatus: 403,
      });

      expect(await roleOf(chatId, owner.userId)).toBe('OWNER');
    });
  });
});
