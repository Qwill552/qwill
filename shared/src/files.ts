import { z } from 'zod';

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Некорректный SHA-256');

/** Заявляется клиентом до передачи байтов; финальный File сервер создаёт только после проверки реального
 *  хэша содержимого — клиенту нельзя доверять для дедупликации/идентичности (секция 7). */
export const initUploadSchema = z.object({
  sha256: sha256Schema,
  size: z.coerce.number().int().positive(),
  mimeType: z.string().min(1),
  originalName: z.string().trim().min(1).max(255),
  purpose: z.enum(['message', 'avatar']).default('message'),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;

export interface FileDto {
  id: string;
  mimeType: string;
  size: number;
  url: string;
}

export type InitUploadResponse =
  | { status: 'exists'; file: FileDto }
  | { status: 'pending'; sessionId: string; receivedBytes: number; chunkSize: number };

export interface UploadChunkResponse {
  receivedBytes: number;
  done: boolean;
  file?: FileDto;
}

export interface AttachmentDto {
  id: string;
  file: FileDto;
  thumbnail: FileDto | null;
  originalName: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  peaks: number[] | null;
}

export type ChatAttachmentKind = 'photo' | 'video' | 'gif' | 'voice' | 'audio' | 'file';

export function categorizeAttachment(mimeType: string, peaks: number[] | null | undefined): ChatAttachmentKind {
  if (peaks && peaks.length > 0) return 'voice';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * sha256 обязателен и здесь: сервер проверяет им, что клиент и правда владеет содержимым
 * fileId (посчитал тот же хэш при initUpload), а не просто подставил чужой id — иначе можно
 * было бы объявить своим аватаром чьё-то приватное вложение и сделать его публично видимым
 * (секция 7).
 */
export const setAvatarSchema = z.object({
  fileId: z.string().min(1),
  sha256: sha256Schema,
});
export type SetAvatarInput = z.infer<typeof setAvatarSchema>;

/** Вложение при отправке сообщения — файл (и, если есть, превью) уже загружены и подтверждены сервером.
 *  sha256 — то же доказательство владения содержимым, что и в setAvatarSchema. */
export const messageAttachmentInputSchema = z.object({
  fileId: z.string().min(1),
  sha256: sha256Schema,
  thumbnailFileId: z.string().min(1).optional(),
  thumbnailSha256: sha256Schema.optional(),
  originalName: z.string().trim().min(1).max(255),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  peaks: z.array(z.number().min(0).max(1)).min(1).max(256).optional(),
});
export type MessageAttachmentInput = z.infer<typeof messageAttachmentInputSchema>;
