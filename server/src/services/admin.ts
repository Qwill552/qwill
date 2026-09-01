import {
  ADMIN_CHAT_ACCESS_SETTING_KEY,
  ADMIN_LOG_PAGE_SIZE,
  ADMIN_PASSWORD_CHANGE_REQUIRED_MESSAGE,
  ADMIN_REAUTH_FAIL_LIMIT,
  ADMIN_REAUTH_LOCK_MINUTES,
  ADMIN_REAUTH_LOCKED_MESSAGE,
  ErrorCode,
  LAST_ADMIN_MESSAGE,
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
  type AdminTicketDto,
  type AdminUserCardDto,
  type AdminUserDto,
  type CreateReportInput,
  type ReportEntryDto,
  type ReportGroupDto,
  type ReportGroupView,
  type ReportKind,
  type ReportStatus,
} from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { AppError, badRequest, banned, forbidden, notFound, rateLimited } from '../lib/errors.js';
import { toAvatarColor } from '../lib/avatarColor.js';
import { fileUrl } from '../lib/fileUrl.js';
import { verifyPassword } from '../lib/password.js';
import { signAdminTicket } from '../lib/tokens.js';
import {
  notifyAdminPanelAccess,
  notifyAdminPanelFailure,
  notifyBanAction,
  notifyNewReport,
} from './adminNotify.js';
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
    supportMutedUntil: user.supportMutedUntil ? user.supportMutedUntil.toISOString() : null,
  };
}

/**
 * Роль читается из базы на каждый запрос, а не из access-токена: токен живёт до истечения,
 * а разжалование и бан обязаны действовать сразу (R-32A). Взведённый mustChangePassword
 * запирает всю панель: роль, выданная скриптом, не работает до смены пароля на длинный (R-32E).
 */
export async function assertAdmin(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || toUserRole(user.role) !== 'admin') throw forbidden();
  if (user.bannedAt) throw banned(user.bannedReason);
  if (user.mustChangePassword) {
    throw forbidden(ADMIN_PASSWORD_CHANGE_REQUIRED_MESSAGE, ErrorCode.PASSWORD_CHANGE_REQUIRED);
  }
  return user;
}

interface ReauthAttempts {
  fails: number;
  lockedUntil: number;
}

const reauthAttempts = new Map<string, ReauthAttempts>();

export async function reauthAdmin(actor: AdminActor, password: string): Promise<AdminTicketDto> {
  const attempts = reauthAttempts.get(actor.adminId);
  if (attempts && attempts.lockedUntil > Date.now()) throw rateLimited(ADMIN_REAUTH_LOCKED_MESSAGE);

  const admin = await assertAdmin(actor.adminId);
  if (!(await verifyPassword(password, admin.passwordHash))) {
    const fails = (attempts?.fails ?? 0) + 1;
    const locked = fails >= ADMIN_REAUTH_FAIL_LIMIT;
    reauthAttempts.set(actor.adminId, {
      fails,
      lockedUntil: locked ? Date.now() + ADMIN_REAUTH_LOCK_MINUTES * 60 * 1000 : 0,
    });
    await recordAdminAction(actor, { action: 'reauth.fail', detail: { fails } });
    notifyAdminPanelFailure({ ip: actor.ip, userAgent: actor.userAgent }, locked);
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, 'Неверный пароль');
  }

  reauthAttempts.delete(actor.adminId);
  notifyAdminPanelAccess({ ip: actor.ip, userAgent: actor.userAgent });
  const ticket = signAdminTicket(actor.adminId);
  return { ticket: ticket.ticket, expiresAt: ticket.expiresAt.toISOString() };
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
    supportMutedUntil: user.supportMutedUntil ? user.supportMutedUntil.toISOString() : null,
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

export async function assertNotLastAdmin(
  tx: Pick<typeof prisma, 'user'>,
  target: Pick<User, 'id' | 'role'>,
  action: string,
): Promise<void> {
  if (toUserRole(target.role) !== 'admin') return;
  const others = await tx.user.count({
    where: { role: 'admin', bannedAt: null, id: { not: target.id } },
  });
  if (others === 0) throw badRequest(ErrorCode.FORBIDDEN, `${LAST_ADMIN_MESSAGE}, ${action} нельзя`);
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
    await assertNotLastAdmin(tx, target, 'забанить его');

    await tx.session.deleteMany({ where: { userId: targetUserId } });
    return tx.user.update({
      where: { id: targetUserId },
      data: { bannedAt: new Date(), bannedReason: reason, bannedById: actor.adminId },
    });
  });

  await recordAdminAction(actor, { action: 'user.ban', targetUserId, detail: { reason } });
  notifyBanAction('ban');
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
  notifyBanAction('unban');
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

export async function getAdminChatAccessEnabled(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({ where: { key: ADMIN_CHAT_ACCESS_SETTING_KEY } });
  return setting?.value === 'true';
}

export async function getAdminSettings(): Promise<AdminSettingsDto> {
  const [profileCardsEnabled, adminChatAccessEnabled] = await Promise.all([
    getProfileCardsEnabled(),
    getAdminChatAccessEnabled(),
  ]);
  return { profileCardsEnabled, adminChatAccessEnabled };
}

export async function setProfileCardsEnabled(actor: AdminActor, enabled: boolean): Promise<AdminSettingsDto> {
  const value = enabled ? 'true' : 'false';
  await prisma.appSetting.upsert({
    where: { key: PROFILE_CARDS_SETTING_KEY },
    create: { key: PROFILE_CARDS_SETTING_KEY, value, updatedById: actor.adminId },
    update: { value, updatedById: actor.adminId },
  });

  await recordAdminAction(actor, { action: 'settings.profileCards', detail: { enabled } });
  return getAdminSettings();
}

export async function setAdminChatAccessEnabled(actor: AdminActor, enabled: boolean): Promise<AdminSettingsDto> {
  const value = enabled ? 'true' : 'false';
  await prisma.appSetting.upsert({
    where: { key: ADMIN_CHAT_ACCESS_SETTING_KEY },
    create: { key: ADMIN_CHAT_ACCESS_SETTING_KEY, value, updatedById: actor.adminId },
    update: { value, updatedById: actor.adminId },
  });

  await recordAdminAction(actor, { action: 'settings.chatAccess', detail: { enabled } });
  return getAdminSettings();
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

  notifyNewReport();
  return toReportDto(report);
}

type ReportWithGroupRelations = Report & {
  reporter: Pick<User, 'username'>;
  targetUser: Pick<User, 'username' | 'displayName' | 'avatarFileId' | 'avatarColor'>;
};

function reportGroupKey(kind: string, targetUserId: string, targetChatId: string | null): string {
  return kind === 'message' ? `message:${targetChatId}` : `${kind}:${targetUserId}`;
}

function toReportEntryDto(report: ReportWithGroupRelations): ReportEntryDto {
  return {
    id: report.id,
    reporterId: report.reporterId,
    reporterUsername: report.reporter.username,
    comment: report.comment,
    targetMessageId: report.targetMessageId,
    status: report.status as ReportStatus,
    createdAt: report.createdAt.toISOString(),
  };
}

async function chatLabel(chatId: string): Promise<{ title: string; avatarUrl: string | null } | null> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { members: { include: { user: { select: { displayName: true } } } } },
  });
  if (!chat) return null;
  if (chat.type === 'GROUP') return { title: chat.title ?? 'Группа', avatarUrl: fileUrl(chat.avatarFileId) };
  return { title: chat.members.map((member) => member.user.displayName).join(' ↔ '), avatarUrl: null };
}

/**
 * Пять жалоб на одну визитку — одна строка с бейджем «5» (32D). Ключ группировки — chat для
 * "message" (объект жалобы — переписка), targetUser для "card"/"profile" (объект — сам человек).
 * "closed" собирает решение и время закрытия по самой свежей жалобе группы — если один и тот же
 * объект закрывали не одной серией, а несколькими за историю, отдельные resolution в это поле
 * не попадают, только последний; полный список жалоб группы виден в `reports`.
 */
export async function listReportGroups(view: ReportGroupView): Promise<ReportGroupDto[]> {
  const reports = await prisma.report.findMany({
    where: view === 'closed' ? { status: 'closed' } : { status: { in: ['new', 'working'] } },
    orderBy: { createdAt: 'desc' },
    take: REPORTS_PAGE_SIZE,
    include: {
      reporter: { select: { username: true } },
      targetUser: { select: { username: true, displayName: true, avatarFileId: true, avatarColor: true } },
    },
  });

  const groups = new Map<string, ReportWithGroupRelations[]>();
  for (const report of reports) {
    const key = reportGroupKey(report.kind, report.targetUserId, report.targetChatId);
    const list = groups.get(key);
    if (list) list.push(report);
    else groups.set(key, [report]);
  }

  const dtos = await Promise.all(
    [...groups.values()].map(async (groupReports): Promise<ReportGroupDto> => {
      const sorted = [...groupReports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const latest = sorted[0]!;
      const chat = latest.kind === 'message' && latest.targetChatId ? await chatLabel(latest.targetChatId) : null;

      const lastClosed =
        view === 'closed'
          ? [...groupReports].sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))[0]
          : null;

      return {
        latestReportId: latest.id,
        kind: latest.kind as ReportKind,
        targetUserId: latest.targetUserId,
        targetUsername: latest.targetUser.username,
        targetDisplayName: latest.targetUser.displayName,
        targetAvatarUrl: fileUrl(latest.targetUser.avatarFileId),
        targetAvatarColor: toAvatarColor(latest.targetUser.avatarColor),
        targetChatId: latest.targetChatId,
        chatTitle: chat?.title ?? null,
        chatAvatarUrl: chat?.avatarUrl ?? null,
        openCount: groupReports.filter((report) => report.status !== 'closed').length,
        hasNew: groupReports.some((report) => report.status === 'new'),
        lastComment: latest.comment,
        lastCreatedAt: latest.createdAt.toISOString(),
        resolution: lastClosed?.resolution ?? null,
        closedAt: lastClosed?.closedAt ? lastClosed.closedAt.toISOString() : null,
        reports: sorted.map(toReportEntryDto),
      };
    }),
  );

  return dtos.sort((a, b) => (a.lastCreatedAt < b.lastCreatedAt ? 1 : -1));
}

interface ReportGroupMembers {
  kind: string;
  targetUserId: string;
  targetChatId: string | null;
  ids: string[];
}

async function findOpenReportGroup(reportId: string): Promise<ReportGroupMembers> {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound(ErrorCode.NOT_FOUND, 'Жалоба не найдена');

  const where =
    report.kind === 'message'
      ? { kind: report.kind, targetChatId: report.targetChatId, status: { not: 'closed' } }
      : { kind: report.kind, targetUserId: report.targetUserId, status: { not: 'closed' } };
  const open = await prisma.report.findMany({ where, select: { id: true } });
  if (open.length === 0) throw notFound(ErrorCode.NOT_FOUND, 'Жалоба не найдена');

  return { kind: report.kind, targetUserId: report.targetUserId, targetChatId: report.targetChatId, ids: open.map((r) => r.id) };
}

/** «Взять в работу» и «Закрыть» действуют на всю группу разом — разбирать пять одинаковых
 *  жалоб поштучно работы без смысла (32D). */
export async function markReportGroupWorking(actor: AdminActor, reportId: string): Promise<void> {
  const group = await findOpenReportGroup(reportId);

  await prisma.report.updateMany({ where: { id: { in: group.ids } }, data: { status: 'working' } });
  await recordAdminAction(actor, {
    action: 'report.working',
    targetUserId: group.targetUserId,
    targetChatId: group.targetChatId,
    detail: { kind: group.kind, count: group.ids.length },
  });
}

export async function closeReportGroup(actor: AdminActor, reportId: string, resolution: string): Promise<void> {
  const group = await findOpenReportGroup(reportId);

  await prisma.report.updateMany({
    where: { id: { in: group.ids } },
    data: { status: 'closed', resolution, closedAt: new Date(), closedById: actor.adminId },
  });
  await recordAdminAction(actor, {
    action: 'report.close',
    targetUserId: group.targetUserId,
    targetChatId: group.targetChatId,
    detail: { kind: group.kind, count: group.ids.length, resolution },
  });
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

export async function revokeAdminRole(username: string): Promise<RoleChangeResult> {
  const normalized = username.trim().toLowerCase();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { username: normalized } });
    if (!existing) throw notFound(ErrorCode.NOT_FOUND, `Пользователь @${normalized} не найден`);
    if (toUserRole(existing.role) !== 'admin') return { user: existing, changed: false };

    await assertNotLastAdmin(tx, existing, 'снять роль');

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

/**
 * «Снять визитку» — мера показа, а не стирание: код остаётся в `ProfileCard`, меняется только
 * режим «О себе». Владелец увидит текстовый режим и, если персональный выключатель не стоит,
 * сможет вернуть визитку сам. Безвозвратное стирание — `clearUserCard` (R-32D).
 */
export async function hideUserCard(actor: AdminActor, targetUserId: string): Promise<AdminUserCardDto> {
  await requireUser(targetUserId);
  const user = await prisma.user.update({ where: { id: targetUserId }, data: { bioMode: 'text' } });

  await recordAdminAction(actor, { action: 'user.card.hide', targetUserId });
  return buildUserCard(user);
}

/** Стирает сам код визитки без возможности восстановления — быстрое действие из разбора жалобы. */
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

export async function muteUserSupport(
  actor: AdminActor,
  targetUserId: string,
  until: string | null,
): Promise<AdminUserCardDto> {
  await requireUser(targetUserId);
  const supportMutedUntil = until ? new Date(until) : null;
  const user = await prisma.user.update({ where: { id: targetUserId }, data: { supportMutedUntil } });

  await recordAdminAction(actor, { action: 'user.support.mute', targetUserId, detail: { until } });
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
