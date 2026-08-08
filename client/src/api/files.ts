import type { ErrorCode, FileDto, InitUploadInput, InitUploadResponse, UploadChunkResponse } from '@messenger/shared';
import { THUMBNAIL_MAX_DIMENSION, UPLOAD_OFFSET_HEADER } from '@messenger/shared';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { API_URL, apiFetch, apiRequest, ApiError } from './client';

/** Читает файл кусками, а не целиком — иначе 2 ГБ пришлось бы держать в памяти вкладки целиком (секция 7). */
const HASH_CHUNK_SIZE = 8 * 1024 * 1024;

async function hashFile(file: File): Promise<string> {
  const hasher = sha256.create();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE) {
    const slice = file.slice(offset, Math.min(offset + HASH_CHUNK_SIZE, file.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
  }
  return bytesToHex(hasher.digest());
}

function initUploadRequest(input: InitUploadInput): Promise<InitUploadResponse> {
  return apiRequest<InitUploadResponse>('/api/files/upload', { method: 'POST', body: input });
}

interface ChunkResult {
  receivedBytes: number;
  done: boolean;
  file?: FileDto;
}

async function uploadChunk(sessionId: string, offset: number, chunk: Blob, signal?: AbortSignal): Promise<ChunkResult> {
  const res = await apiFetch(`/api/files/upload/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/octet-stream', [UPLOAD_OFFSET_HEADER]: String(offset) },
    body: chunk,
    signal,
  });
  const data: unknown = await res.json().catch(() => null);

  // 409 с receivedBytes — не ошибка, а ресинхронизация: сервер сообщает, откуда докачивать (секция 7).
  if (res.status === 409 && data && typeof data === 'object' && 'receivedBytes' in data) {
    return { receivedBytes: (data as { receivedBytes: number }).receivedBytes, done: false };
  }
  if (!res.ok) {
    const body = data as { error?: { code: ErrorCode; message: string } } | null;
    throw new ApiError(body?.error ?? { code: 'INTERNAL' as ErrorCode, message: 'Не удалось загрузить файл' }, res.status);
  }
  return data as UploadChunkResponse;
}

export type UploadPurpose = 'message' | 'avatar';

export interface UploadedFile extends FileDto {
  sha256: string;
}

/**
 * Хэширует файл локально, проверяет дедупликацию (POST /files/upload), затем докачивает
 * кусками с ресинхронизацией смещения при обрыве — «продолжение с места остановки» (секция 7).
 */
export async function uploadFile(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  const sha256Hex = await hashFile(file);
  const mimeType = file.type || 'application/octet-stream';

  const init = await initUploadRequest({
    sha256: sha256Hex,
    size: file.size,
    mimeType,
    originalName: file.name,
    purpose,
  });

  if (init.status === 'exists') {
    onProgress?.(file.size, file.size);
    return { ...init.file, sha256: sha256Hex };
  }

  let offset = init.receivedBytes;
  const { sessionId, chunkSize } = init;
  onProgress?.(offset, file.size);

  let stuckStreak = 0;
  while (true) {
    signal?.throwIfAborted();
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, end);
    const result = await uploadChunk(sessionId, offset, chunk, signal);

    stuckStreak = result.receivedBytes === offset ? stuckStreak + 1 : 0;
    if (stuckStreak > 3) throw new Error('Не удаётся синхронизировать загрузку с сервером');

    offset = result.receivedBytes;
    onProgress?.(offset, file.size);

    if (result.done) {
      if (!result.file) throw new Error('Сервер не вернул файл по завершении загрузки');
      return { ...result.file, sha256: sha256Hex };
    }
  }
}

function fitDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canvasToJpegFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Не удалось создать превью'));
          return;
        }
        resolve(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.75,
    );
  });
}

export interface ThumbnailResult {
  file: File;
  width: number;
  height: number;
}

/** Уменьшенная копия снимается канвасом на клиенте — сервер обходится без ffmpeg (секция 7). */
export function generateImageThumbnail(source: File): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(source);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, THUMBNAIL_MAX_DIMENSION);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas недоступен'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvasToJpegFile(canvas, 'thumb.jpg')
        .then((file) => resolve({ file, width: img.naturalWidth, height: img.naturalHeight }))
        .catch(reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

export interface VideoThumbnailResult extends ThumbnailResult {
  /** Миллисекунды. */
  duration: number;
}

/** Кадр из видео снимается канвасом после seek на середину ролика (секция 7). */
export function generateVideoThumbnail(source: File): Promise<VideoThumbnailResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(source);

    function cleanup(): void {
      URL.revokeObjectURL(url);
      video.remove();
    }

    video.onloadedmetadata = () => {
      video.currentTime = Number.isFinite(video.duration) ? video.duration / 2 : 0;
    };

    video.onseeked = () => {
      const { width, height } = fitDimensions(video.videoWidth, video.videoHeight, THUMBNAIL_MAX_DIMENSION);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('Canvas недоступен'));
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const duration = Math.round((Number.isFinite(video.duration) ? video.duration : 0) * 1000);
      canvasToJpegFile(canvas, 'thumb.jpg')
        .then((file) => {
          cleanup();
          resolve({ file, width: video.videoWidth, height: video.videoHeight, duration });
        })
        .catch((error: unknown) => {
          cleanup();
          reject(error instanceof Error ? error : new Error('Не удалось создать превью видео'));
        });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Не удалось прочитать видео'));
    };
    video.src = url;
  });
}

/** Короткоживущий токен для img/video src — Bearer-заголовок эти теги отправить не могут (секция 7). */
export async function fetchFileToken(fileId: string): Promise<string> {
  const { token } = await apiRequest<{ token: string }>(`/api/files/${fileId}/token`);
  return token;
}

export function buildFileSrc(fileId: string, token: string): string {
  return `${API_URL}/api/files/${fileId}?token=${encodeURIComponent(token)}`;
}
