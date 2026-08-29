import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CARD_IMAGE_MAX_BYTES,
  CARD_IMAGE_MAX_COUNT,
  CARD_IMAGE_MAX_DIMENSION,
  CARD_IMAGE_TOTAL_MAX_BYTES,
  ErrorCode,
  isValidCardImageName,
  type CardImageDto,
  type CardImageListDto,
} from '@messenger/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError, badRequest, conflict, notFound, tooLarge } from '../lib/errors.js';
import { processImage } from '../lib/processImage.js';
import type { ProfileCardImage } from '../generated/prisma/client.js';

const CARDS_DIR = path.join(env.storageDir, 'cards');

function userDir(userId: string): string {
  return path.join(CARDS_DIR, userId);
}

function fileFor(image: Pick<ProfileCardImage, 'userId' | 'storageId'>): string {
  return path.join(userDir(image.userId), image.storageId);
}

export function cardImageUrlFor(userId: string, name: string): string {
  return `${env.CARD_ORIGIN}/c/${userId}/img/${encodeURIComponent(name)}`;
}

function toDto(image: ProfileCardImage): CardImageDto {
  return {
    name: image.name,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    url: cardImageUrlFor(image.userId, image.name),
  };
}

function formatMb(bytes: number): string {
  return (Math.round((bytes / (1024 * 1024)) * 10) / 10).toLocaleString('ru-RU');
}

export async function listCardImages(userId: string): Promise<CardImageListDto> {
  const images = await prisma.profileCardImage.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return {
    images: images.map(toDto),
    totalBytes: images.reduce((sum, image) => sum + image.bytes, 0),
    maxBytes: CARD_IMAGE_TOTAL_MAX_BYTES,
    maxCount: CARD_IMAGE_MAX_COUNT,
  };
}

export async function addCardImage(
  userId: string,
  requestedName: string,
  body: Buffer,
  replace: boolean,
): Promise<CardImageDto> {
  const name = requestedName.trim().toLowerCase();
  if (!isValidCardImageName(name)) {
    throw badRequest(
      ErrorCode.VALIDATION_FAILED,
      'Имя картинки — латиница, цифры, точка, дефис и подчёркивание, до 64 символов, с расширением png, jpg, jpeg, webp или gif',
    );
  }

  if (body.length > CARD_IMAGE_MAX_BYTES) {
    throw tooLarge(`Один файл — не больше ${formatMb(CARD_IMAGE_MAX_BYTES)} МБ, а этот ${formatMb(body.length)} МБ`);
  }

  const existing = await prisma.profileCardImage.findMany({ where: { userId } });
  const base = name.slice(0, name.lastIndexOf('.'));

  const processed = await processImage(body, {
    maxDimension: CARD_IMAGE_MAX_DIMENSION,
    maxBytes: CARD_IMAGE_MAX_BYTES,
  });
  const finalName = `${base}.${processed.ext}`;

  const previous = existing.find((image) => image.name === finalName);
  if (previous && !replace) {
    throw conflict(ErrorCode.VALIDATION_FAILED, `Картинка «${finalName}» уже есть — выберите другое имя или замените её`);
  }

  if (!previous && existing.length >= CARD_IMAGE_MAX_COUNT) {
    throw new AppError(
      ErrorCode.STORAGE_FULL,
      413,
      `Уже ${existing.length} картинок из ${CARD_IMAGE_MAX_COUNT} — удалите лишние`,
    );
  }

  const otherBytes = existing
    .filter((image) => image.id !== previous?.id)
    .reduce((sum, image) => sum + image.bytes, 0);
  if (otherBytes + processed.data.length > CARD_IMAGE_TOTAL_MAX_BYTES) {
    throw new AppError(
      ErrorCode.STORAGE_FULL,
      413,
      `Занято ${formatMb(otherBytes)} МБ из ${formatMb(CARD_IMAGE_TOTAL_MAX_BYTES)} МБ, ` +
        `картинка на ${formatMb(processed.data.length)} МБ не помещается`,
    );
  }

  const storageId = `${randomBytes(16).toString('hex')}.${processed.ext}`;
  await fs.mkdir(userDir(userId), { recursive: true });
  await fs.writeFile(path.join(userDir(userId), storageId), processed.data);

  const data = {
    storageId,
    mime: processed.mime,
    width: processed.width,
    height: processed.height,
    bytes: processed.data.length,
  };

  const saved = previous
    ? await prisma.profileCardImage.update({ where: { id: previous.id }, data })
    : await prisma.profileCardImage.create({ data: { userId, name: finalName, ...data } });

  if (previous) await fs.unlink(fileFor(previous)).catch(() => undefined);

  return toDto(saved);
}

export async function deleteCardImage(userId: string, name: string): Promise<void> {
  const image = await prisma.profileCardImage.findUnique({ where: { userId_name: { userId, name } } });
  if (!image) throw notFound(ErrorCode.FILE_NOT_FOUND, 'Картинка не найдена');

  await prisma.profileCardImage.delete({ where: { id: image.id } });
  await fs.unlink(fileFor(image)).catch(() => undefined);
}

export interface CardImageForServing {
  path: string;
  mime: string;
  bytes: number;
}

export async function findCardImageForServing(userId: string, name: string): Promise<CardImageForServing | null> {
  if (!isValidCardImageName(name)) return null;

  const image = await prisma.profileCardImage.findUnique({ where: { userId_name: { userId, name } } });
  if (!image) return null;

  return { path: fileFor(image), mime: image.mime, bytes: image.bytes };
}
