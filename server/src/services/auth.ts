import {
  ADMIN_PASSWORD_MIN_LENGTH,
  ErrorCode,
  PASSWORD_MIN_LENGTH,
  toUserRole,
  type UserRole,
} from '@messenger/shared';

import { CURRENT_LEGAL_VERSIONS } from '../config/legal.js';
import { prisma } from '../db/prisma.js';
import { AppError, banned, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  sessionExpiryForRole,
  signAccessToken,
  verifyAccessToken,
} from '../lib/tokens.js';
import { notifyAdminLoginSuccess } from './adminNotify.js';
import { createUser, getUserById, toPublicUser, verifyCredentials } from './user.js';
import type { User } from '../generated/prisma/client.js';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  user: ReturnType<typeof toPublicUser>;
}

export interface ClientContext {
  userAgent: string | undefined;
  ip: string | undefined;
}

async function issueSession(
  user: User,
  client: ClientContext,
  originIp?: string | null,
  previousTokenHash?: string,
): Promise<SessionTokens> {
  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      previousTokenHash: previousTokenHash ?? null,
      expiresAt: sessionExpiryForRole(toUserRole(user.role)),
      userAgent: client.userAgent,
      ip: originIp ?? client.ip ?? null,
      lastSeenIp: client.ip ?? null,
    },
  });

  return {
    accessToken: signAccessToken(user.id),
    refreshToken,
    user: toPublicUser(user),
  };
}

export async function register(
  input: {
    username: string;
    password: string;
    displayName: string;
    termsVersion: string;
    privacyVersion: string;
  },
  client: ClientContext,
): Promise<SessionTokens> {
  if (
    input.termsVersion !== CURRENT_LEGAL_VERSIONS.termsVersion ||
    input.privacyVersion !== CURRENT_LEGAL_VERSIONS.privacyVersion
  ) {
    throw new AppError(
      ErrorCode.LEGAL_VERSION_OUTDATED,
      409,
      'Документы обновились, обновите страницу и попробуйте снова',
    );
  }

  const user = await createUser({
    ...input,
    signupIp: client.ip,
    signupUserAgent: client.userAgent,
  });
  return issueSession(user, client);
}

export async function login(
  username: string,
  password: string,
  client: ClientContext,
): Promise<SessionTokens> {
  const user = await verifyCredentials(username, password, client);
  if (toUserRole(user.role) === 'admin') {
    notifyAdminLoginSuccess({ ip: client.ip, userAgent: client.userAgent });
  }
  return issueSession(user, client);
}

/** Ротация: старая сессия удаляется, выдаётся новая пара токенов (секция 3). */
export async function refresh(refreshToken: string, client: ClientContext): Promise<SessionTokens> {
  const tokenHash = hashRefreshToken(refreshToken);
  const session =
    (await prisma.session.findUnique({ where: { refreshTokenHash: tokenHash } })) ??
    (await prisma.session.findFirst({ where: { previousTokenHash: tokenHash } }));

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    throw new AppError(ErrorCode.TOKEN_INVALID, 401, 'Сессия истекла, войдите заново');
  }

  const user = await getUserById(session.userId);
  if (user.bannedAt) throw banned(user.bannedReason);
  // deleteMany, а не delete: параллельный повторный /refresh с тем же токеном (двойной
  // вызов bootstrap в React StrictMode, гонка нескольких вкладок) уже мог удалить строку —
  // delete() бросил бы P2025 вместо аккуратной ротации токена.
  await prisma.session.deleteMany({ where: { id: session.id } });
  return issueSession(user, client, session.ip, session.refreshTokenHash);
}

/** Разлогин = удаление строки Session — отсюда бесплатно «выйти со всех устройств» (секция 3). */
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.session.deleteMany({ where: { refreshTokenHash: tokenHash } });
}

/**
 * Бан обязан подействовать сразу: удаление сессий закрывает refresh, а эта проверка — окно
 * до истечения уже выданного access-токена. Лишний findUnique по первичному ключу дешевле
 * пользователя, который ещё пятнадцать минут пишет в чаты после блокировки (R-32A).
 */
export async function assertNotBanned(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, bannedReason: true },
  });
  if (!user) throw unauthorized('Пользователь не найден');
  if (user.bannedAt) throw banned(user.bannedReason);
}

export function passwordMinLengthForRole(role: UserRole): number {
  return role === 'admin' ? ADMIN_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentRefreshToken: string | undefined,
): Promise<{ terminatedSessions: number }> {
  const user = await getUserById(userId);
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 400, 'Неверный текущий пароль');
  }

  const minLength = passwordMinLengthForRole(toUserRole(user.role));
  if (newPassword.length < minLength) {
    throw new AppError(ErrorCode.VALIDATION_FAILED, 400, `Пароль не короче ${minLength} символов`, {
      fields: { newPassword: `Пароль не короче ${minLength} символов` },
    });
  }
  if (newPassword === currentPassword) {
    throw new AppError(ErrorCode.VALIDATION_FAILED, 400, 'Новый пароль совпадает со старым', {
      fields: { newPassword: 'Новый пароль совпадает со старым' },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });

  const currentSessionHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : undefined;
  const { count } = await prisma.session.deleteMany({
    where: {
      userId,
      ...(currentSessionHash ? { refreshTokenHash: { not: currentSessionHash } } : {}),
    },
  });

  return { terminatedSessions: count };
}

export async function requireUserFromAccessToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw unauthorized();
  }
  const token = authorizationHeader.slice('Bearer '.length);

  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    throw new AppError(ErrorCode.TOKEN_INVALID, 401, 'Недействительный токен');
  }

  await assertNotBanned(userId);
  return userId;
}
