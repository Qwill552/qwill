import { createHash, randomBytes } from 'node:crypto';

import { PROFILE_CARD_MAX_BYTES, toBioMode, type ProfileCardPreviewDto } from '@messenger/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { tooLarge } from '../lib/errors.js';
import { sanitizeProfileCard } from '../lib/sanitizeProfileCard.js';
import { getProfileCardsEnabled } from './admin.js';
import type { User } from '../generated/prisma/client.js';

export interface VisibleCard {
  html: string;
  updatedAt: Date;
}

/** Короткий хеш времени сохранения: адрес меняется вместе с визиткой, и кадр не показывает
 *  зрителю вчерашнюю версию из кэша. */
function cardVersion(updatedAt: Date): string {
  return createHash('sha256').update(updatedAt.toISOString()).digest('hex').slice(0, 12);
}

export function cardUrlFor(userId: string, updatedAt: Date): string {
  // Завершающий слэш обязателен: относительные пути внутри визитки (`img/cat.png`) должны
  // разрешаться в папку этого пользователя, а не на уровень выше.
  return `${env.CARD_ORIGIN}/c/${userId}/?v=${cardVersion(updatedAt)}`;
}

/**
 * Единственная точка, где сходятся все причины не показывать визитку: режим «О себе»,
 * персональный выключатель, глобальный рубильник и бан. И маршрут песочницы, и профильный
 * DTO спрашивают её, а не повторяют условия у себя.
 */
export async function findVisibleCard(userId: string): Promise<VisibleCard | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bioMode: true, cardDisabled: true, bannedAt: true, isService: true },
  });
  if (!user || user.isService) return null;
  if (toBioMode(user.bioMode) !== 'html') return null;
  if (user.cardDisabled || user.bannedAt) return null;
  if (!(await getProfileCardsEnabled())) return null;

  const card = await prisma.profileCard.findUnique({ where: { userId } });
  if (!card || card.html.trim() === '') return null;
  return { html: card.html, updatedAt: card.updatedAt };
}

/** Адрес визитки для `UserProfileDto` — null, если показывать нечего. */
export async function cardUrlForProfile(user: Pick<User, 'id'>): Promise<string | null> {
  const card = await findVisibleCard(user.id);
  return card ? cardUrlFor(user.id, card.updatedAt) : null;
}

/** Исходник для редактора — до всех выключателей и без оглядки на режим: владелец правит
 *  свой черновик даже тогда, когда показывать его сейчас никому не будут. */
export async function getOwnCardHtml(userId: string): Promise<string> {
  const card = await prisma.profileCard.findUnique({ where: { userId } });
  return card?.html ?? '';
}

export function assertCardSizeAllowed(byteLength: number): void {
  if (byteLength > PROFILE_CARD_MAX_BYTES) {
    throw tooLarge(`Визитка не больше ${Math.floor(PROFILE_CARD_MAX_BYTES / (1024 * 1024))} МБ`);
  }
}

export async function saveCard(userId: string, rawHtml: string): Promise<VisibleCard> {
  assertCardSizeAllowed(Buffer.byteLength(rawHtml, 'utf8'));

  const html = sanitizeProfileCard(rawHtml);
  const card = await prisma.profileCard.upsert({
    where: { userId },
    create: { userId, html },
    update: { html },
  });
  return { html: card.html, updatedAt: card.updatedAt };
}

export async function deleteCard(userId: string): Promise<void> {
  dropPreviewOf(userId);
  await prisma.profileCard.deleteMany({ where: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { bioMode: 'text' } });
}

const PREVIEW_TTL_MS = 10 * 60 * 1000;

interface CardPreview {
  userId: string;
  html: string;
  expiresAt: number;
}

const previewsByToken = new Map<string, CardPreview>();
const previewTokenByUser = new Map<string, string>();

function dropPreviewOf(userId: string): void {
  const token = previewTokenByUser.get(userId);
  if (!token) return;
  previewsByToken.delete(token);
  previewTokenByUser.delete(userId);
}

function dropExpiredPreviews(now: number): void {
  for (const [token, preview] of previewsByToken) {
    if (preview.expiresAt > now) continue;
    previewsByToken.delete(token);
    if (previewTokenByUser.get(preview.userId) === token) previewTokenByUser.delete(preview.userId);
  }
}

export function previewUrlFor(token: string): string {
  return `${env.CARD_ORIGIN}/c/preview/${token}/`;
}

export function savePreview(userId: string, rawHtml: string): ProfileCardPreviewDto {
  assertCardSizeAllowed(Buffer.byteLength(rawHtml, 'utf8'));

  const now = Date.now();
  dropExpiredPreviews(now);
  dropPreviewOf(userId);

  const token = randomBytes(16).toString('hex');
  previewsByToken.set(token, {
    userId,
    html: sanitizeProfileCard(rawHtml),
    expiresAt: now + PREVIEW_TTL_MS,
  });
  previewTokenByUser.set(userId, token);
  return { token, url: previewUrlFor(token) };
}

export function findPreview(token: string): { userId: string; html: string } | null {
  const preview = previewsByToken.get(token);
  if (!preview) return null;
  if (preview.expiresAt <= Date.now()) {
    dropPreviewOf(preview.userId);
    return null;
  }
  return { userId: preview.userId, html: preview.html };
}
