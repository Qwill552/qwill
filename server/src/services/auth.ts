import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { AppError, unauthorized } from '../lib/errors.js';
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

async function issueSession(user: User, userAgent: string | undefined): Promise<SessionTokens> {
  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
      userAgent,
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
  userAgent: string | undefined,
): Promise<SessionTokens> {
  const user = await createUser(input);
  return issueSession(user, userAgent);
}

export async function login(
  username: string,
  password: string,
  userAgent: string | undefined,
): Promise<SessionTokens> {
  const user = await verifyCredentials(username, password);
  return issueSession(user, userAgent);
}

/** Ротация: старая сессия удаляется, выдаётся новая пара токенов (секция 3). */
export async function refresh(
  refreshToken: string,
  userAgent: string | undefined,
): Promise<SessionTokens> {
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: tokenHash } });

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    throw new AppError(ErrorCode.TOKEN_INVALID, 401, 'Сессия истекла, войдите заново');
  }

  const user = await getUserById(session.userId);
  await prisma.session.delete({ where: { id: session.id } });
  return issueSession(user, userAgent);
}

/** Разлогин = удаление строки Session — отсюда бесплатно «выйти со всех устройств» (секция 3). */
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.session.deleteMany({ where: { refreshTokenHash: tokenHash } });
}

export async function requireUserFromAccessToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw unauthorized();
  }
  const token = authorizationHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    return payload.sub;
  } catch {
    throw new AppError(ErrorCode.TOKEN_INVALID, 401, 'Недействительный токен');
  }
}
