import type { PublicUser, UpdateProfileDTO, UpdateSettingsInput, UserSearchResult, UserSettingsDTO } from '@messenger/shared';
import { ErrorCode, FONT_SIZE_VALUES, THEME_VALUES, USER_SEARCH_PAGE_SIZE } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { fileUrl } from '../lib/fileUrl.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { pairKeyFor } from './chat.js';
import { assertAvatarEligible } from './file.js';
import type { User } from '../generated/prisma/client.js';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: fileUrl(user.avatarFileId),
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

function toUserSettingsDto(user: Pick<User, 'theme' | 'fontSize'>): UserSettingsDTO {
  return {
    theme: (THEME_VALUES as readonly string[]).includes(user.theme) ? (user.theme as UserSettingsDTO['theme']) : 'system',
    fontSize: (FONT_SIZE_VALUES as readonly string[]).includes(user.fontSize)
      ? (user.fontSize as UserSettingsDTO['fontSize'])
      : 'medium',
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
    },
  });
  return toUserSettingsDto(user);
}

/** Поиск по подстроке username, себя исключаем; isContact — уже есть приватный чат с этим пользователем (этап 8). */
export async function searchUsers(query: string, requesterId: string): Promise<UserSearchResult[]> {
  const candidates = await prisma.user.findMany({
    where: {
      username: { contains: query.toLowerCase() },
      id: { not: requesterId },
    },
    take: USER_SEARCH_PAGE_SIZE,
    orderBy: { username: 'asc' },
  });
  if (candidates.length === 0) return [];

  const pairKeys = candidates.map((candidate) => pairKeyFor(requesterId, candidate.id));
  const existingChats = await prisma.chat.findMany({
    where: { type: 'PRIVATE', pairKey: { in: pairKeys } },
    select: { pairKey: true },
  });
  const existingPairKeys = new Set(existingChats.map((chat) => chat.pairKey));

  return candidates.map((candidate) => ({
    id: candidate.id,
    username: candidate.username,
    displayName: candidate.displayName,
    avatarUrl: fileUrl(candidate.avatarFileId),
    isContact: existingPairKeys.has(pairKeyFor(requesterId, candidate.id)),
  }));
}
