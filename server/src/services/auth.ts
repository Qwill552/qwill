import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { AppError, banned, unauthorized } from '../lib/errors.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from '../lib/tokens.js';
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
): Promise<SessionTokens> {
  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
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
  input: { username: string; password: string; displayName: string },
  client: ClientContext,
): Promise<SessionTokens> {
  const user = await createUser(input);
  return issueSession(user, client);
}

export async function login(
  username: string,
  password: string,
  client: ClientContext,
): Promise<SessionTokens> {
  const user = await verifyCredentials(username, password);
  return issueSession(user, client);
}

/** Ротация: старая сессия удаляется, выдаётся новая пара токенов (секция 3). */
export async function refresh(refreshToken: string, client: ClientContext): Promise<SessionTokens> {
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: tokenHash } });

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
  return issueSession(user, client, session.ip);
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
