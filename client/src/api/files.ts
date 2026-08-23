import type { ErrorCode, FileDto, InitUploadInput, InitUploadResponse, UploadChunkResponse } from '@messenger/shared';
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_MAX_DIMENSION,
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_MAX_DIMENSION,
  UPLOAD_OFFSET_HEADER,
} from '@messenger/shared';
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

export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function fitDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function drawScaled(source: CanvasImageSource, rect: SourceRect, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
  return canvas;
}

function downscaleInSteps(
  source: CanvasImageSource,
  rect: SourceRect,
  target: { width: number; height: number },
): HTMLCanvasElement {
  let current = source;
  let currentRect = rect;

  while (currentRect.width > target.width * 2 && currentRect.height > target.height * 2) {
    const width = Math.max(target.width, Math.round(currentRect.width / 2));
    const height = Math.max(target.height, Math.round(currentRect.height / 2));
    current = drawScaled(current, currentRect, width, height);
    currentRect = { x: 0, y: 0, width, height };
  }

  return drawScaled(current, currentRect, target.width, target.height);
}

function canvasToJpegFile(canvas: HTMLCanvasElement, name: string, quality: number): Promise<File> {
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
      quality,
    );
  });
}

export function cropImageToAvatarFile(image: HTMLImageElement, rect: SourceRect): Promise<File> {
  const side = Math.min(AVATAR_MAX_DIMENSION, Math.round(rect.width));
  const canvas = downscaleInSteps(image, rect, { width: side, height: side });
  return canvasToJpegFile(canvas, 'avatar.jpg', AVATAR_JPEG_QUALITY);
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
      const source = { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
      const target = fitDimensions(source.width, source.height, THUMBNAIL_MAX_DIMENSION);
      let canvas: HTMLCanvasElement;
      try {
        canvas = downscaleInSteps(img, source, target);
      } catch (error) {
        reject(error);
        return;
      }
      canvasToJpegFile(canvas, 'thumb.jpg', THUMBNAIL_JPEG_QUALITY)
        .then((file) => resolve({ file, width: source.width, height: source.height }))
        .catch(reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

export interface MediaSize {
  width: number;
  height: number;
}

export function measureMediaSize(source: File): Promise<MediaSize | null> {
  if (source.type.startsWith('image/')) {
    return new Promise((resolve) => {
      const image = new Image();
      const url = URL.createObjectURL(source);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      image.src = url;
    });
  }

  if (source.type.startsWith('video/')) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const url = URL.createObjectURL(source);
      function finish(size: MediaSize | null): void {
        URL.revokeObjectURL(url);
        video.remove();
        resolve(size);
      }
      video.onloadedmetadata = () => finish(video.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : null);
      video.onerror = () => finish(null);
      video.src = url;
    });
  }

  return Promise.resolve(null);
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
      const frame = { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
      const target = fitDimensions(frame.width, frame.height, THUMBNAIL_MAX_DIMENSION);
      let canvas: HTMLCanvasElement;
      try {
        canvas = downscaleInSteps(video, frame, target);
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }
      const duration = Math.round((Number.isFinite(video.duration) ? video.duration : 0) * 1000);
      canvasToJpegFile(canvas, 'thumb.jpg', THUMBNAIL_JPEG_QUALITY)
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

const FILE_TOKEN_TTL_MS = 45 * 60 * 1000;

const fileTokens = new Map<string, { token: string; issuedAt: number }>();
const tokenRequests = new Map<string, Promise<string>>();

export function getFileToken(fileId: string): Promise<string> {
  const cached = fileTokens.get(fileId);
  if (cached && Date.now() - cached.issuedAt < FILE_TOKEN_TTL_MS) return Promise.resolve(cached.token);

  const pending = tokenRequests.get(fileId);
  if (pending) return pending;

  const request = fetchFileToken(fileId)
    .then((token) => {
      fileTokens.set(fileId, { token, issuedAt: Date.now() });
      return token;
    })
    .finally(() => tokenRequests.delete(fileId));

  tokenRequests.set(fileId, request);
  return request;
}
