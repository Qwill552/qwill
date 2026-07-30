import type { PublicUser } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import type { User } from '../generated/prisma/client.js';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

export async function createUser(input: {
  username: string;
  password: string;
  displayName: string;
}): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) {
    throw new AppError(ErrorCode.USERNAME_TAKEN, 409, 'Это имя пользователя уже занято');
  }

  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      displayName: input.displayName,
    },
  });
}

export async function verifyCredentials(username: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, 'Неверное имя пользователя или пароль');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, 'Неверное имя пользователя или пароль');
  }

  return user;
}

export async function getUserById(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Пользователь не найден');
  }
  return user;
}
