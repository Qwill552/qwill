import type { BlockStateDto, ChatMemberSummary } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { toMemberSummary } from './userSummary.js';

export type BlockState = BlockStateDto;

export const NO_BLOCK: BlockState = { iBlocked: false, blockedMe: false };

export function invertBlockState(state: BlockState): BlockState {
  return { iBlocked: state.blockedMe, blockedMe: state.iBlocked };
}

async function assertBlockTarget(userId: string, targetId: string): Promise<void> {
  if (userId === targetId) throw badRequest(ErrorCode.VALIDATION_FAILED, 'Нельзя заблокировать самого себя');

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { isService: true } });
  if (!target) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');
  if (target.isService) throw badRequest(ErrorCode.VALIDATION_FAILED, 'Этого пользователя нельзя заблокировать');
}

export async function blockStateBetween(userId: string, otherId: string): Promise<BlockState> {
  if (userId === otherId) return NO_BLOCK;

  const rows = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    },
    select: { blockerId: true },
  });

  return {
    iBlocked: rows.some((row) => row.blockerId === userId),
    blockedMe: rows.some((row) => row.blockerId === otherId),
  };
}

export async function blockStatesFor(userId: string): Promise<Map<string, BlockState>> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });

  const states = new Map<string, BlockState>();
  for (const row of rows) {
    const otherId = row.blockerId === userId ? row.blockedId : row.blockerId;
    const current = states.get(otherId) ?? { ...NO_BLOCK };
    if (row.blockerId === userId) current.iBlocked = true;
    else current.blockedMe = true;
    states.set(otherId, current);
  }
  return states;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<BlockState> {
  await assertBlockTarget(blockerId, blockedId);

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });

  return blockStateBetween(blockerId, blockedId);
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<BlockState> {
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
  return blockStateBetween(blockerId, blockedId);
}

export async function listBlocked(userId: string): Promise<ChatMemberSummary[]> {
  const rows = await prisma.block.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    include: { blocked: true },
  });

  return rows.map((row) => toMemberSummary(row.blocked));
}
