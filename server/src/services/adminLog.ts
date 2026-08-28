import { prisma } from '../db/prisma.js';

const DETAIL_MAX_BYTES = 1024;

export interface AdminActor {
  adminId: string;
  ip: string;
  userAgent?: string;
}

export interface AdminActionRecord {
  action: string;
  targetUserId?: string | null;
  targetChatId?: string | null;
  detail?: unknown;
}

function serializeDetail(detail: unknown): string | null {
  if (detail === undefined || detail === null) return null;
  const json = JSON.stringify(detail);
  if (!json) return null;
  return Buffer.byteLength(json, 'utf8') > DETAIL_MAX_BYTES ? json.slice(0, DETAIL_MAX_BYTES) : json;
}

async function resolveUsernames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, username: true },
  });
  return new Map(users.map((user) => [user.id, user.username]));
}

/** Единственная точка записи в журнал администрирования: строку заводит только она,
 *  маршрутов на правку и удаление AdminAction не существует вовсе (R-32A). */
export async function recordAdminAction(actor: AdminActor, record: AdminActionRecord): Promise<void> {
  const targetUserId = record.targetUserId ?? null;
  const usernames = await resolveUsernames([actor.adminId, targetUserId]);

  await prisma.adminAction.create({
    data: {
      adminId: actor.adminId,
      adminUsername: usernames.get(actor.adminId) ?? null,
      action: record.action,
      targetUserId,
      targetUsername: targetUserId ? (usernames.get(targetUserId) ?? null) : null,
      targetChatId: record.targetChatId ?? null,
      detail: serializeDetail(record.detail),
      ip: actor.ip,
      userAgent: actor.userAgent ?? null,
    },
  });
}
