import type { PublicUser, UpdateProfileDTO, UpdateSettingsInput, UserSettingsDTO } from '@messenger/shared';
import { ErrorCode, FONT_SIZE_VALUES, SURFACE_VALUES, THEME_VALUES } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { randomAvatarColor, toAvatarColor } from '../lib/avatarColor.js';
import { AppError } from '../lib/errors.js';
import { fileUrl } from '../lib/fileUrl.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { assertAvatarEligible } from './file.js';
import type { User } from '../generated/prisma/client.js';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: fileUrl(user.avatarFileId),
    avatarColor: toAvatarColor(user.avatarColor),
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
      avatarColor: randomAvatarColor(),
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

export async function setAvatar(userId: string, fileId: string, sha256: string): Promise<PublicUser> {
  await assertAvatarEligible(fileId, sha256);
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarFileId: fileId } });
  return toPublicUser(user);
}

export async function updateProfile(userId: string, data: UpdateProfileDTO): Promise<PublicUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { ...(data.displayName !== undefined ? { displayName: data.displayName } : {}) },
  });
  return toPublicUser(user);
}

function toUserSettingsDto(user: Pick<User, 'theme' | 'fontSize' | 'surface'>): UserSettingsDTO {
  return {
    theme: (THEME_VALUES as readonly string[]).includes(user.theme) ? (user.theme as UserSettingsDTO['theme']) : 'system',
    fontSize: (FONT_SIZE_VALUES as readonly string[]).includes(user.fontSize)
      ? (user.fontSize as UserSettingsDTO['fontSize'])
      : 'medium',
    surface: (SURFACE_VALUES as readonly string[]).includes(user.surface)
      ? (user.surface as UserSettingsDTO['surface'])
      : 'glass',
  };
}

export async function getSettings(userId: string): Promise<UserSettingsDTO> {
  const user = await getUserById(userId);
  return toUserSettingsDto(user);
}

export async function updateSettings(userId: string, data: UpdateSettingsInput): Promise<UserSettingsDTO> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.fontSize !== undefined ? { fontSize: data.fontSize } : {}),
      ...(data.surface !== undefined ? { surface: data.surface } : {}),
    },
  });
  return toUserSettingsDto(user);
}
