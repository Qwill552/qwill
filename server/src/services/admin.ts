import {
  ADMIN_LOG_PAGE_SIZE,
  ErrorCode,
  PROFILE_CARDS_SETTING_KEY,
  REPORTS_PER_DAY_LIMIT,
  toBioMode,
  toUserRole,
  type AdminLogEntryDto,
  type AdminLogPageDto,
  type AdminLogQuery,
  type AdminPiiDto,
  type AdminReportDto,
  type AdminSettingsDto,
  type AdminUserCardDto,
  type AdminUserDto,
  type CreateReportInput,
  type ReportKind,
  type ReportStatus,
} from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { AppError, badRequest, banned, forbidden, notFound, rateLimited } from '../lib/errors.js';
import { recordAdminAction, type AdminActor } from './adminLog.js';
import { deleteCard } from './profileCard.js';
import type { AdminAction, Report, Session, User } from '../generated/prisma/client.js';

const REPORTS_PAGE_SIZE = 200;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function toAdminUser(user: User): AdminUserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: toUserRole(user.role),
    createdAt: user.createdAt.toISOString(),
    bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
    bannedReason: user.bannedReason,
    cardDisabled: user.cardDisabled,
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * Роль читается из базы на каждый запрос, а не из access-токена: токен живёт до истечения,
 * а разжалование и бан обязаны действовать сразу (R-32A). Отказ по mustChangePassword
 * включается в 32E — вместе со сменой пароля, без которой снять флаг нечем.
 */
export async function assertAdmin(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || toUserRole(user.role) !== 'admin') throw forbidden();
  if (user.bannedAt) throw banned(user.bannedReason);
  return user;
}

async function requireUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');
  return user;
}

async function buildUserCard(user: User): Promise<AdminUserCardDto> {
  const [bannedBy, chatCount, messageCount, reportsAgainst, reportsFiled, sessionCount, card] =
    await Promise.all([
      user.bannedById
        ? prisma.user.findUnique({ where: { id: user.bannedById }, select: { username: true } })
        : Promise.resolve(null),
      prisma.chatMember.count({ where: { userId: user.id } }),
      prisma.message.count({ where: { senderId: user.id } }),
      prisma.report.count({ where: { targetUserId: user.id } }),
      prisma.report.count({ where: { reporterId: user.id } }),
      prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
      prisma.profileCard.findUnique({ where: { userId: user.id }, select: { html: true } }),
    ]);

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: toUserRole(user.role),
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
    bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
    bannedReason: user.bannedReason,
    bannedByUsername: bannedBy?.username ?? null,
    cardDisabled: user.cardDisabled,
    mustChangePassword: user.mustChangePassword,
    bioMode: toBioMode(user.bioMode),
    hasBio: Boolean(user.bio && user.bio.trim().length > 0),
    hasCard: Boolean(card && card.html.trim().length > 0),
    hasAvatar: user.avatarFileId !== null,
    chatCount,
    messageCount,
    reportsAgainst,
    reportsFiled,
    sessionCount,
  };
}

export async function findAdminUserCardByUsername(username: string): Promise<AdminUserCardDto> {
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  if (!user) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');
  return buildUserCard(user);
}

export async function getAdminUserCard(userId: string): Promise<AdminUserCardDto> {
  return buildUserCard(await requireUser(userId));
}

async function countOtherActiveAdmins(
  tx: Pick<typeof prisma, 'user'>,
  exceptUserId: string,
): Promise<number> {
  return tx.user.count({ where: { role: 'admin', bannedAt: null, id: { not: exceptUserId } } });
}

/**
 * Бан действует сразу, а не «когда протухнет токен»: одной транзакцией ставятся поля и
 * удаляются все refresh-сессии. Сообщения и файлы не трогаются — это ограничение доступа,
 * а не стирание истории.
 */
export async function banUser(
  actor: AdminActor,
  targetUserId: string,
  reason: string,
): Promise<AdminUserCardDto> {
  if (targetUserId === actor.adminId) throw badRequest(ErrorCode.FORBIDDEN, 'Нельзя забанить себя');

  const user = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');
    if (toUserRole(target.role) === 'admin' && (await countOtherActiveAdmins(tx, targetUserId)) === 0) {
      throw badRequest(ErrorCode.FORBIDDEN, 'Нельзя забанить последнего администратора');
    }

    await tx.session.deleteMany({ where: { userId: targetUserId } });
    return tx.user.update({
      where: { id: targetUserId },
      data: { bannedAt: new Date(), bannedReason: reason, bannedById: actor.adminId },
    });
  });

  await recordAdminAction(actor, { action: 'user.ban', targetUserId, detail: { reason } });
  return buildUserCard(user);
}

export async function unbanUser(actor: AdminActor, targetUserId: string): Promise<AdminUserCardDto> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');

  const user = await prisma.user.update({
    where: { id: targetUserId },
    data: { bannedAt: null, bannedReason: null, bannedById: null },
  });

  await recordAdminAction(actor, { action: 'user.unban', targetUserId });
  return buildUserCard(user);
}

export async function setUserCardDisabled(
  actor: AdminActor,
  targetUserId: string,
  disabled: boolean,
): Promise<AdminUserCardDto> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');

  const user = await prisma.user.update({ where: { id: targetUserId }, data: { cardDisabled: disabled } });
  await recordAdminAction(actor, { action: 'user.card', targetUserId, detail: { disabled } });
  return buildUserCard(user);
}

/**
 * Читается на каждом запросе визитки, без кэша: строка по первичному ключу это выдержит,
 * а задержка в пять минут обесценивает саму идею рубильника.
 */
export async function getProfileCardsEnabled(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({ where: { key: PROFILE_CARDS_SETTING_KEY } });
  return setting ? setting.value === 'true' : true;
}

export async function getAdminSettings(): Promise<AdminSettingsDto> {
  return { profileCardsEnabled: await getProfileCardsEnabled() };
}

export async function setProfileCardsEnabled(actor: AdminActor, enabled: boolean): Promise<AdminSettingsDto> {
  const value = enabled ? 'true' : 'false';
  await prisma.appSetting.upsert({
    where: { key: PROFILE_CARDS_SETTING_KEY },
    create: { key: PROFILE_CARDS_SETTING_KEY, value, updatedById: actor.adminId },
    update: { value, updatedById: actor.adminId },
  });

  await recordAdminAction(actor, { action: 'settings.profileCards', detail: { enabled } });
  return { profileCardsEnabled: enabled };
}

type ReportWithNames = Report & {
  reporter: Pick<User, 'username'>;
  targetUser: Pick<User, 'username'>;
};

function toReportDto(report: ReportWithNames): AdminReportDto {
  return {
    id: report.id,
    reporterId: report.reporterId,
    reporterUsername: report.reporter.username,
    targetUserId: report.targetUserId,
    targetUsername: report.targetUser.username,
    targetChatId: report.targetChatId,
    targetMessageId: report.targetMessageId,
    kind: report.kind as ReportKind,
    comment: report.comment,
    status: report.status as ReportStatus,
    resolution: report.resolution,
    createdAt: report.createdAt.toISOString(),
    closedAt: report.closedAt ? report.closedAt.toISOString() : null,
  };
}

export async function createReport(reporterId: string, input: CreateReportInput): Promise<AdminReportDto> {
  const target = await prisma.user.findUnique({ where: { id: input.targetUserId } });
  if (!target) throw notFound(ErrorCode.NOT_FOUND, 'Пользователь не найден');

  const sinceDayAgo = new Date(Date.now() - REPORT_WINDOW_MS);
  const filedToday = await prisma.report.count({
    where: { reporterId, createdAt: { gte: sinceDayAgo } },
  });
  if (filedToday >= REPORTS_PER_DAY_LIMIT) {
    throw rateLimited('Слишком много жалоб за сутки, попробуйте завтра');
  }

  const report = await prisma.report.create({
    data: {
      reporterId,
      targetUserId: input.targetUserId,
      targetChatId: input.targetChatId ?? null,
      targetMessageId: input.targetMessageId ?? null,
      kind: input.kind,
      comment: input.comment,
    },
    include: { reporter: { select: { username: true } }, targetUser: { select: { username: true } } },
  });

  return toReportDto(report);
}

export async function listReports(status?: ReportStatus): Promise<AdminReportDto[]> {
  const reports = await prisma.report.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: REPORTS_PAGE_SIZE,
    include: { reporter: { select: { username: true } }, targetUser: { select: { username: true } } },
  });
  return reports.map(toReportDto);
}

export interface RoleChangeResult {
  user: AdminUserDto;
  changed: boolean;
}

/** Только для консольного скрипта: маршрута, повышающего до admin, в API нет вовсе. */
export async function grantAdminRole(username: string): Promise<RoleChangeResult> {
  const normalized = username.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username: normalized } });
  if (!existing) throw notFound(ErrorCode.NOT_FOUND, `Пользователь @${normalized} не найден`);
  if (toUserRole(existing.role) === 'admin') return { user: toAdminUser(existing), changed: false };

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: { role: 'admin', mustChangePassword: true },
  });

  await recordAdminAction(
    { adminId: user.id, ip: 'console' },
    { action: 'role.grant', targetUserId: user.id, detail: { source: 'console', username: normalized } },
  );
  return { user: toAdminUser(user), changed: true };
}

/**
 * Проверка «остался ли ещё администратор» идёт внутри той же транзакции, что и запись:
 * иначе два одновременных запуска скрипта разжаловали бы обоих.
 */
export async function revokeAdminRole(username: string): Promise<RoleChangeResult> {
  const normalized = username.trim().toLowerCase();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { username: normalized } });
    if (!existing) throw notFound(ErrorCode.NOT_FOUND, `Пользователь @${normalized} не найден`);
    if (toUserRole(existing.role) !== 'admin') return { user: existing, changed: false };

    const others = await tx.user.count({ where: { role: 'admin', id: { not: existing.id } } });
    if (others === 0) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        403,
        `@${normalized} — последний администратор, снять роль нельзя`,
      );
    }

    const user = await tx.user.update({ where: { id: existing.id }, data: { role: 'user' } });
    return { user, changed: true };
  });

  if (result.changed) {
    await recordAdminAction(
      { adminId: result.user.id, ip: 'console' },
      { action: 'role.revoke', targetUserId: result.user.id, detail: { source: 'console', username: normalized } },
    );
  }
  return { user: toAdminUser(result.user), changed: result.changed };
}

const PII_SESSION_LIMIT = 20;

function toSessionDto(session: Session) {
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    ip: session.ip,
    lastSeenIp: session.lastSeenIp,
    userAgent: session.userAgent,
  };
}

export async function revealUserPii(actor: AdminActor, targetUserId: string): Promise<AdminPiiDto> {
  const user = await requireUser(targetUserId);
  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: PII_SESSION_LIMIT,
  });

  await recordAdminAction(actor, { action: 'user.pii.reveal', targetUserId });
  return {
    signupIp: null,
    signupUserAgent: null,
    sessions: sessions.map(toSessionDto),
  };
}

export async function setUserDisplayName(
  actor: AdminActor,
  targetUserId: string,
  displayName: string,
): Promise<AdminUserCardDto> {
  const before = await requireUser(targetUserId);
  const user = await prisma.user.update({ where: { id: targetUserId }, data: { displayName } });

  await recordAdminAction(actor, {
    action: 'user.displayName',
    targetUserId,
    detail: { from: before.displayName, to: displayName },
  });
  return buildUserCard(user);
}

export async function clearUserAvatar(actor: AdminActor, targetUserId: string): Promise<AdminUserCardDto> {
  await requireUser(targetUserId);
  const user = await prisma.user.update({ where: { id: targetUserId }, data: { avatarFileId: null } });

  await recordAdminAction(actor, { action: 'user.avatar.clear', targetUserId });
  return buildUserCard(user);
}

export async function clearUserCard(actor: AdminActor, targetUserId: string): Promise<AdminUserCardDto> {
  await requireUser(targetUserId);
  await deleteCard(targetUserId);

  await recordAdminAction(actor, { action: 'user.card.clear', targetUserId });
  return getAdminUserCard(targetUserId);
}

export async function clearUserBio(actor: AdminActor, targetUserId: string): Promise<AdminUserCardDto> {
  await requireUser(targetUserId);
  const user = await prisma.user.update({ where: { id: targetUserId }, data: { bio: null } });

  await recordAdminAction(actor, { action: 'user.bio.clear', targetUserId });
  return buildUserCard(user);
}

export async function revokeUserSessions(actor: AdminActor, targetUserId: string): Promise<AdminUserCardDto> {
  const user = await requireUser(targetUserId);
  const { count } = await prisma.session.deleteMany({ where: { userId: targetUserId } });

  await recordAdminAction(actor, { action: 'user.sessions.revoke', targetUserId, detail: { count } });
  return buildUserCard(user);
}

function toLogEntryDto(entry: AdminAction): AdminLogEntryDto {
  return {
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    adminId: entry.adminId,
    adminUsername: entry.adminUsername,
    action: entry.action,
    targetUserId: entry.targetUserId,
    targetUsername: entry.targetUsername,
    targetChatId: entry.targetChatId,
    detail: entry.detail,
    ip: entry.ip,
    userAgent: entry.userAgent,
  };
}

function dayBounds(from: string | undefined, to: string | undefined): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  const start = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const end = to ? new Date(`${to}T23:59:59.999Z`) : null;
  if (start && !Number.isNaN(start.getTime())) range.gte = start;
  if (end && !Number.isNaN(end.getTime())) range.lte = end;
  return range;
}

export async function listAdminLog(query: AdminLogQuery): Promise<AdminLogPageDto> {
  const range = dayBounds(query.from, query.to);
  const entries = await prisma.adminAction.findMany({
    where: {
      ...(query.admin ? { adminUsername: { contains: query.admin, mode: 'insensitive' as const } } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(range.gte || range.lte ? { createdAt: range } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ADMIN_LOG_PAGE_SIZE,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  return {
    entries: entries.map(toLogEntryDto),
    nextCursor: entries.length === ADMIN_LOG_PAGE_SIZE ? (entries[entries.length - 1]?.id ?? null) : null,
  };
}
