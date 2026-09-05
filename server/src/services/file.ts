import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ALLOWED_MIME_TYPES,
  AVATAR_MIME_TYPES,
  AVATAR_STORED_MAX_DIMENSION,
  ErrorCode,
  type FileDto,
  type InitUploadInput,
  type InitUploadResponse,
} from '@messenger/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError, notFound, tooLarge } from '../lib/errors.js';
import { looksLikeText, resolveContainerMimeType, sniffMimeType } from '../lib/fileSignature.js';
import { logger } from '../lib/logger.js';
import { isProcessableImageMimeType, processImage, type ProcessedImage } from '../lib/processImage.js';
import type { File, UploadSession } from '../generated/prisma/client.js';

const TMP_DIR = path.join(env.storageDir, 'tmp');
const FILES_DIR = path.join(env.storageDir, 'files');

export async function ensureStorageDirs(): Promise<void> {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(FILES_DIR, { recursive: true });
}

export function toFileDto(file: File): FileDto {
  return { id: file.id, mimeType: file.mimeType, size: Number(file.size), url: `/api/files/${file.id}` };
}

async function safeUnlink(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch(() => undefined);
}

function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function isProcessedFile(file: File): boolean {
  return file.sourceSha256 !== null && file.sourceSha256 !== file.sha256;
}

async function findDeduplicated(sourceSha256: string, size: number, purpose: string): Promise<File | null> {
  const candidates = await prisma.file.findMany({ where: { sourceSha256 }, take: 10 });
  const wantProcessed = purpose === 'avatar';
  for (const candidate of candidates) {
    if (isProcessedFile(candidate) !== wantProcessed) continue;
    if (!wantProcessed && Number(candidate.size) !== size) continue;
    return candidate;
  }
  return null;
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function readHead(filePath: string, bytes: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Открывает сессию докачки — либо мгновенно находит уже загруженный файл по хэшу (дедупликация, секция 7). */
export async function initUpload(userId: string, input: InitUploadInput): Promise<InitUploadResponse> {
  const existing = await findDeduplicated(input.sha256, input.size, input.purpose);
  if (existing) {
    return { status: 'exists', file: toFileDto(existing) };
  }

  const limitBytes = input.purpose === 'avatar' ? env.MAX_AVATAR_SIZE_BYTES : env.MAX_FILE_SIZE_BYTES;
  if (input.size > limitBytes) {
    throw tooLarge(`Файл больше ${Math.floor(limitBytes / (1024 * 1024))} МБ`);
  }

  const allowedTypes: readonly string[] = input.purpose === 'avatar' ? AVATAR_MIME_TYPES : ALLOWED_MIME_TYPES;
  if (!allowedTypes.includes(input.mimeType)) {
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415, 'Недопустимый тип файла');
  }

  // Тот же файл уже частично докачан этим пользователем — переиспользуем сессию, а не начинаем
  // с нуля: обрыв связи и повторный вызов initUpload иначе теряли бы уже принятые байты (секция 7).
  const inProgress = await prisma.uploadSession.findFirst({
    where: { userId, sha256: input.sha256, size: input.size, purpose: input.purpose },
    orderBy: { createdAt: 'desc' },
  });
  if (inProgress) {
    return {
      status: 'pending',
      sessionId: inProgress.id,
      receivedBytes: Number(inProgress.receivedBytes),
      chunkSize: env.UPLOAD_CHUNK_SIZE_BYTES,
    };
  }

  const tempPath = path.join(TMP_DIR, randomUUID());
  await fs.writeFile(tempPath, Buffer.alloc(0));

  const session = await prisma.uploadSession.create({
    data: {
      userId,
      sha256: input.sha256,
      size: input.size,
      mimeType: input.mimeType,
      originalName: input.originalName,
      purpose: input.purpose,
      tempPath,
    },
  });

  return { status: 'pending', sessionId: session.id, receivedBytes: 0, chunkSize: env.UPLOAD_CHUNK_SIZE_BYTES };
}

export type AppendChunkResult =
  | { status: 'accepted'; receivedBytes: number }
  | { status: 'done'; receivedBytes: number; file: FileDto }
  | { status: 'offset-mismatch'; receivedBytes: number };

/** Дописывает кусок на диск; обрыв связи — клиент присылает offset заново с последнего known-good (секция 7). */
export async function appendChunk(
  sessionId: string,
  userId: string,
  offset: number,
  chunk: Buffer,
): Promise<AppendChunkResult> {
  const session = await prisma.uploadSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    throw notFound(ErrorCode.UPLOAD_SESSION_NOT_FOUND, 'Сессия загрузки не найдена');
  }

  const receivedBytes = Number(session.receivedBytes);
  if (offset !== receivedBytes) {
    return { status: 'offset-mismatch', receivedBytes };
  }

  const expectedSize = Number(session.size);
  const nextReceived = receivedBytes + chunk.length;
  if (nextReceived > expectedSize) {
    throw new AppError(ErrorCode.VALIDATION_FAILED, 400, 'Кусок выходит за размер файла, заявленный при инициализации');
  }

  await fs.appendFile(session.tempPath, chunk);
  await prisma.uploadSession.update({ where: { id: sessionId }, data: { receivedBytes: nextReceived } });

  if (nextReceived < expectedSize) {
    return { status: 'accepted', receivedBytes: nextReceived };
  }

  const file = await finalizeUpload({ ...session, receivedBytes: BigInt(nextReceived) });
  return { status: 'done', receivedBytes: nextReceived, file };
}

async function finalizeUpload(session: UploadSession): Promise<FileDto> {
  const sourceSha256 = await hashFile(session.tempPath);
  if (sourceSha256 !== session.sha256) {
    await safeUnlink(session.tempPath);
    await prisma.uploadSession.delete({ where: { id: session.id } }).catch(() => undefined);
    throw new AppError(ErrorCode.UPLOAD_HASH_MISMATCH, 400, 'Файл повреждён при передаче, попробуйте снова');
  }

  // Определяющий тип — сигнатура содержимого, а не то, что заявил клиент (секция 7).
  const head = await readHead(session.tempPath, 4096);
  const sniffed = sniffMimeType(head);
  const allowedTypes: readonly string[] = session.purpose === 'avatar' ? AVATAR_MIME_TYPES : ALLOWED_MIME_TYPES;
  const finalMime = sniffed
    ? resolveContainerMimeType(sniffed, session.mimeType)
    : session.mimeType === 'text/plain' && looksLikeText(head)
      ? 'text/plain'
      : null;

  if (!finalMime || !allowedTypes.includes(finalMime)) {
    await safeUnlink(session.tempPath);
    await prisma.uploadSession.delete({ where: { id: session.id } }).catch(() => undefined);
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415, 'Недопустимый тип файла');
  }

  let processed: ProcessedImage | null = null;
  if (session.purpose === 'avatar' && isProcessableImageMimeType(finalMime)) {
    const source = await fs.readFile(session.tempPath);
    try {
      processed = await processImage(source, {
        maxDimension: AVATAR_STORED_MAX_DIMENSION,
        maxBytes: env.MAX_AVATAR_SIZE_BYTES,
      });
    } catch (error) {
      await safeUnlink(session.tempPath);
      await prisma.uploadSession.delete({ where: { id: session.id } }).catch(() => undefined);
      throw error;
    }
  }

  const storedSha256 = processed ? hashBuffer(processed.data) : sourceSha256;
  const storedMime = processed ? processed.mime : finalMime;
  const storedSize = processed ? BigInt(processed.data.length) : session.size;

  // Повторная проверка дедупликации по реальному хэшу — на случай, если параллельная
  // загрузка того же файла завершилась первой, пока эта ещё принимала куски.
  const existing = await findDeduplicated(sourceSha256, Number(session.size), session.purpose);
  if (existing) {
    await safeUnlink(session.tempPath);
    await prisma.uploadSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return toFileDto(existing);
  }

  const finalPath = path.join(FILES_DIR, storedSha256);
  if (processed) {
    await fs.writeFile(finalPath, processed.data);
    await safeUnlink(session.tempPath);
  } else {
    try {
      await fs.rename(session.tempPath, finalPath);
    } catch {
      await fs.copyFile(session.tempPath, finalPath);
      await safeUnlink(session.tempPath);
    }
  }

  let file: File;
  try {
    file = await prisma.file.create({
      data: {
        sha256: storedSha256,
        sourceSha256,
        storedName: storedSha256,
        mimeType: storedMime,
        size: storedSize,
        uploadedByUserId: session.userId,
      },
    });
  } catch {
    // Гонка: другая загрузка того же файла успела создать File первой (unique(sha256) отклонил эту).
    await safeUnlink(finalPath);
    file = await prisma.file.findUniqueOrThrow({ where: { sha256: storedSha256 } });
  }

  await prisma.uploadSession.delete({ where: { id: session.id } }).catch(() => undefined);
  await enforceStorageLimit();

  return toFileDto(file);
}

/** STORAGE_LIMIT_GB/STORAGE_POLICY (секция 7): warn — только предупреждает в лог, evict — чистит невостребованное. */
async function enforceStorageLimit(): Promise<void> {
  const agg = await prisma.file.aggregate({ _sum: { size: true } });
  const totalBytes = Number(agg._sum.size ?? 0n);
  const limitBytes = env.STORAGE_LIMIT_GB * 1024 ** 3;
  if (totalBytes <= limitBytes) return;

  if (env.STORAGE_POLICY === 'warn') {
    logger.warn({ totalBytes, limitBytes }, 'Хранилище превысило STORAGE_LIMIT_GB (policy=warn — ничего не удаляется)');
    return;
  }

  let overBy = totalBytes - limitBytes;
  const candidates = await prisma.file.findMany({
    where: {
      attachments: { none: {} },
      thumbnailOfAttachments: { none: {} },
      previewOfAttachments: { none: {} },
      avatarOfUsers: { none: {} },
      linkPreviews: { none: {} },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  for (const file of candidates) {
    if (overBy <= 0) break;
    await safeUnlink(path.join(FILES_DIR, file.storedName));
    await prisma.file.delete({ where: { id: file.id } }).catch(() => undefined);
    overBy -= Number(file.size);
  }

  if (overBy > 0) {
    logger.warn({ overBy }, 'STORAGE_POLICY=evict не смог освободить место — невостребованных файлов не осталось');
  }
}

export async function storeServerFile(data: Buffer, mimeType: string): Promise<File> {
  const sha256 = hashBuffer(data);
  const existing = await prisma.file.findUnique({ where: { sha256 } });
  if (existing) return existing;

  await ensureStorageDirs();
  await fs.writeFile(path.join(FILES_DIR, sha256), data);

  try {
    return await prisma.file.create({
      data: { sha256, storedName: sha256, mimeType, size: BigInt(data.length) },
    });
  } catch {
    return prisma.file.findUniqueOrThrow({ where: { sha256 } });
  }
}

export async function readStoredFile(fileId: string): Promise<Buffer | null> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  return fs.readFile(path.join(FILES_DIR, file.storedName)).catch(() => null);
}

export interface FileAccessInfo {
  storedName: string;
  mimeType: string;
  size: number;
}

/** Путь к файлу на диске + проверка, что fileId и правда принадлежит существующему File (для раздачи). */
export async function getFileForServing(fileId: string): Promise<FileAccessInfo & { path: string }> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) throw notFound(ErrorCode.FILE_NOT_FOUND, 'Файл не найден');
  return {
    storedName: file.storedName,
    mimeType: file.mimeType,
    size: Number(file.size),
    path: path.join(FILES_DIR, file.storedName),
  };
}

/**
 * sha256 доказывает, что вызывающий и правда владеет содержимым fileId (посчитал тот же хэш
 * при initUpload), а не просто подставил чужой id. Сверяется с sourceSha256 — хэшем того, что
 * прислал клиент: у картинок, прошедших конвейер обработки, байты на диске уже другие (R-30C) — иначе можно было бы угадать/подсмотреть id
 * чужого приватного вложения и объявить его своим аватаром или вложением в новое сообщение,
 * сделав публично видимым (секция 7). Дедупликации не мешает: тот же хэш прошёл бы проверку
 * для любого пользователя, который реально прислал эти же байты.
 */
export async function assertFileOwnershipProof(fileId: string, sha256: string): Promise<File> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || (file.sourceSha256 ?? file.sha256) !== sha256) {
    throw notFound(ErrorCode.FILE_NOT_FOUND, 'Файл не найден');
  }
  return file;
}

export async function assertAvatarEligible(fileId: string, sha256: string): Promise<void> {
  const file = await assertFileOwnershipProof(fileId, sha256);
  const avatarMimeTypes: readonly string[] = AVATAR_MIME_TYPES;
  if (!avatarMimeTypes.includes(file.mimeType)) {
    throw new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415, 'Аватар должен быть изображением');
  }
}

/**
 * Доступ к файлу разрешён, если он чей-то аватар пользователя (условно публичны в рамках
 * приложения), либо картинка OG-превью (взята с публичного адреса, к чату не привязана, PM-8),
 * либо аватар группы, участником которой является userId (в отличие от аватара
 * пользователя — не публичен, виден только участникам), либо вложен в сообщение чата, участником
 * которого является userId (секция 3, 7).
 */
export async function assertFileAccess(fileId: string, userId: string): Promise<void> {
  const isUserAvatar = await prisma.user.findFirst({ where: { avatarFileId: fileId }, select: { id: true } });
  if (isUserAvatar) return;

  const isLinkPreviewImage = await prisma.linkPreview.findFirst({ where: { imageFileId: fileId }, select: { url: true } });
  if (isLinkPreviewImage) return;

  const chatAvatarOf = await prisma.chat.findFirst({ where: { avatarFileId: fileId }, select: { id: true } });
  if (chatAvatarOf) {
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: chatAvatarOf.id, userId } },
    });
    if (member) return;
  }

  const attachment = await prisma.attachment.findFirst({
    where: { OR: [{ fileId }, { thumbnailFileId: fileId }, { previewFileId: fileId }] },
    select: { message: { select: { chatId: true } } },
  });
  if (attachment) {
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: attachment.message.chatId, userId } },
    });
    if (member) return;
  }

  throw notFound(ErrorCode.FILE_NOT_FOUND, 'Файл не найден');
}
