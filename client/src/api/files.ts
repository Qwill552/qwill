import type { ErrorCode, FileDto, InitUploadInput, InitUploadResponse, UploadChunkResponse } from '@messenger/shared';
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_MAX_DIMENSION,
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_MAX_DIMENSION,
  UPLOAD_OFFSET_HEADER,
} from '@messenger/shared';

import { API_URL, apiFetch, apiRequest, ApiError } from './client';
import { canvasToJpegBlob, downscaleInSteps, drawScaled, fitDimensions, type SourceRect } from './imageCanvas';
import { hashBlob } from './mediaTasks';

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

const RATE_LIMIT_ATTEMPTS = 4;
const RATE_LIMIT_BASE_DELAY_MS = 1500;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    function onAbort(): void {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 429 на загрузке — не отказ, а «подожди»: сессия на сервере жива, докачка продолжится с того же смещения. */
async function withRateLimitRetry<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const limited = error instanceof ApiError && error.status === 429;
      if (!limited || attempt + 1 >= RATE_LIMIT_ATTEMPTS) throw error;
      await wait(RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt, signal);
    }
  }
}

/** Кадрирование через canvas плющит GIF до одного кадра — аватар из GIF грузится сырым
 *  файлом, минуя кроппер, чтобы `<img>` показывал его анимированным, как и везде в браузере. */
export function isGifFile(file: File): boolean {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name);
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
  knownSha256?: string,
): Promise<UploadedFile> {
  const sha256Hex = knownSha256 ?? (await hashBlob(file));
  const mimeType = file.type || 'application/octet-stream';

  const init = await withRateLimitRetry(
    () =>
      initUploadRequest({
        sha256: sha256Hex,
        size: file.size,
        mimeType,
        originalName: file.name,
        purpose,
      }),
    signal,
  );

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
    const result = await withRateLimitRetry(() => uploadChunk(sessionId, offset, chunk, signal), signal);

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

async function canvasToJpegFile(canvas: HTMLCanvasElement, name: string, quality: number): Promise<File> {
  return new File([await canvasToJpegBlob(canvas, quality)], name, { type: 'image/jpeg' });
}

export function cropImageToAvatarFile(image: HTMLImageElement, rect: SourceRect): Promise<File> {
  const side = Math.min(AVATAR_MAX_DIMENSION, Math.round(rect.width));
  const canvas = downscaleInSteps(image, rect, { width: side, height: side });
  return canvasToJpegFile(canvas, 'avatar.jpg', AVATAR_JPEG_QUALITY);
}

interface DisposalPending {
  clearRect?: { left: number; top: number; width: number; height: number };
  restore?: ImageData;
}

/**
 * Кадрирование через `cropImageToAvatarFile` идёт через canvas одного кадра — для GIF это
 * плющит анимацию. Здесь каждый кадр перерисовывается на общий холст по правилам GIF
 * (disposalType 2/3 — не просто copy), кадрируется и уходит в тот же 256-цветный кодер,
 * а не в JPEG.
 */
export async function cropGifToAvatarFile(file: File, rect: SourceRect): Promise<File> {
  const [{ parseGIF, decompressFrames }, { GIFEncoder, quantize, applyPalette }] = await Promise.all([
    import('gifuct-js'),
    import('gifenc'),
  ]);

  const parsed = parseGIF(await file.arrayBuffer());
  const frames = decompressFrames(parsed, true);
  const canvasWidth = parsed.lsd.width;
  const canvasHeight = parsed.lsd.height;

  const composite = document.createElement('canvas');
  composite.width = canvasWidth;
  composite.height = canvasHeight;
  const compositeCtx = composite.getContext('2d', { willReadFrequently: true });
  if (!compositeCtx) throw new Error('Canvas недоступен');

  const side = Math.min(AVATAR_MAX_DIMENSION, Math.round(rect.width));
  const encoder = GIFEncoder();
  let pending: DisposalPending | null = null;

  for (const frame of frames) {
    if (pending?.restore) {
      compositeCtx.putImageData(pending.restore, 0, 0);
    } else if (pending?.clearRect) {
      const { left, top, width, height } = pending.clearRect;
      compositeCtx.clearRect(left, top, width, height);
    }
    pending = null;

    const preDrawSnapshot =
      frame.disposalType === 3 ? compositeCtx.getImageData(0, 0, canvasWidth, canvasHeight) : null;

    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = frame.dims.width;
    patchCanvas.height = frame.dims.height;
    const patchCtx = patchCanvas.getContext('2d');
    if (!patchCtx) throw new Error('Canvas недоступен');
    patchCtx.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height), 0, 0);
    compositeCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

    const cropped = drawScaled(composite, rect, side, side);
    const croppedCtx = cropped.getContext('2d');
    if (!croppedCtx) throw new Error('Canvas недоступен');
    const { data } = croppedCtx.getImageData(0, 0, side, side);

    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    encoder.writeFrame(index, side, side, { palette, delay: frame.delay });

    if (frame.disposalType === 2) {
      pending = { clearRect: frame.dims };
    } else if (frame.disposalType === 3 && preDrawSnapshot) {
      pending = { restore: preDrawSnapshot };
    }
  }

  encoder.finish();
  return new File([new Uint8Array(encoder.bytes())], 'avatar.gif', { type: 'image/gif' });
}

export interface ThumbnailResult {
  file: File;
  width: number;
  height: number;
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
