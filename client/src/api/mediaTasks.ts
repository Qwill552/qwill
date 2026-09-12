import {
  PREVIEW_JPEG_QUALITY,
  PREVIEW_MAX_DIMENSION,
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_MAX_DIMENSION,
} from '@messenger/shared';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { canvasToJpegBlob, downscaleInSteps, fitDimensions, loadImageFromBlob } from './imageCanvas';
import type { HashJob, ImageJob, MediaJob, MediaJobResult } from './mediaWorker';

const HASH_CHUNK_SIZE = 8 * 1024 * 1024;

export interface ImageAssets {
  thumb: Blob;
  thumbHash: string;
  /** null — исходник и так не крупнее превью: пересжатие только испортило бы картинку. */
  preview: Blob | null;
  width: number;
  height: number;
}

async function hashOnMainThread(blob: Blob): Promise<string> {
  const hasher = sha256.create();
  for (let offset = 0; offset < blob.size; offset += HASH_CHUNK_SIZE) {
    const slice = blob.slice(offset, Math.min(offset + HASH_CHUNK_SIZE, blob.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
  }
  return bytesToHex(hasher.digest());
}

async function imageAssetsOnMainThread(blob: Blob): Promise<ImageAssets> {
  const image = await loadImageFromBlob(blob);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  const thumbCanvas = downscaleInSteps(
    image,
    { x: 0, y: 0, width, height },
    fitDimensions(width, height, THUMBNAIL_MAX_DIMENSION),
  );
  const thumb = await canvasToJpegBlob(thumbCanvas, THUMBNAIL_JPEG_QUALITY);

  const previewCanvas =
    Math.max(width, height) > PREVIEW_MAX_DIMENSION
      ? downscaleInSteps(
          thumbCanvas,
          { x: 0, y: 0, width: thumbCanvas.width, height: thumbCanvas.height },
          fitDimensions(width, height, PREVIEW_MAX_DIMENSION),
        )
      : null;
  const preview = previewCanvas ? await canvasToJpegBlob(previewCanvas, PREVIEW_JPEG_QUALITY) : null;

  return { thumb, thumbHash: await hashOnMainThread(thumb), preview, width, height };
}

type Pending = { resolve: (result: MediaJobResult) => void; reject: (error: Error) => void };

let worker: Worker | null | undefined;
let nextJobId = 1;
const pending = new Map<number, Pending>();

function failAll(error: Error): void {
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;

  try {
    const created = new Worker(new URL('./mediaWorker.ts', import.meta.url), { type: 'module' });
    created.addEventListener('message', (event: MessageEvent<MediaJobResult>) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      entry.resolve(event.data);
    });
    created.addEventListener('error', () => {
      worker = null;
      failAll(new Error('Обработчик медиа недоступен'));
    });
    worker = created;
  } catch {
    worker = null;
  }

  return worker;
}

type JobRequest = Omit<HashJob, 'id'> | Omit<ImageJob, 'id'>;

function runJob(job: JobRequest): Promise<MediaJobResult> {
  const active = getWorker();
  if (!active) return Promise.reject(new Error('Обработчик медиа недоступен'));

  const id = nextJobId++;
  return new Promise<MediaJobResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    active.postMessage({ ...job, id } as MediaJob);
  });
}

export async function hashBlob(blob: Blob): Promise<string> {
  const result = await runJob({ kind: 'hash', blob }).catch(() => null);
  if (result?.ok && result.kind === 'hash') return result.hash;
  return hashOnMainThread(blob);
}

export async function buildImageAssets(blob: Blob): Promise<ImageAssets> {
  const result = await runJob({
    kind: 'image',
    blob,
    thumbMax: THUMBNAIL_MAX_DIMENSION,
    thumbQuality: THUMBNAIL_JPEG_QUALITY,
    previewMax: PREVIEW_MAX_DIMENSION,
    previewQuality: PREVIEW_JPEG_QUALITY,
  }).catch(() => null);

  if (result?.ok && result.kind === 'image') {
    const { thumb, thumbHash, preview, width, height } = result;
    return { thumb, thumbHash, preview, width, height };
  }

  return imageAssetsOnMainThread(blob);
}
