import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const HASH_CHUNK_SIZE = 8 * 1024 * 1024;

export interface HashJob {
  id: number;
  kind: 'hash';
  blob: Blob;
}

export interface ImageJob {
  id: number;
  kind: 'image';
  blob: Blob;
  thumbMax: number;
  thumbQuality: number;
  previewMax: number;
  previewQuality: number;
}

export type MediaJob = HashJob | ImageJob;

export interface HashDone {
  id: number;
  ok: true;
  kind: 'hash';
  hash: string;
}

export interface ImageDone {
  id: number;
  ok: true;
  kind: 'image';
  thumb: Blob;
  thumbHash: string;
  preview: Blob;
  width: number;
  height: number;
}

export interface JobFailed {
  id: number;
  ok: false;
  error: string;
}

export type MediaJobResult = HashDone | ImageDone | JobFailed;

async function hashBlobInWorker(blob: Blob): Promise<string> {
  const hasher = sha256.create();
  for (let offset = 0; offset < blob.size; offset += HASH_CHUNK_SIZE) {
    const slice = blob.slice(offset, Math.min(offset + HASH_CHUNK_SIZE, blob.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
  }
  return bytesToHex(hasher.digest());
}

function fitDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function paint(source: CanvasImageSource, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas недоступен');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function downscale(
  source: CanvasImageSource,
  from: { width: number; height: number },
  target: { width: number; height: number },
): OffscreenCanvas {
  let current = source;
  let currentSize = from;

  while (currentSize.width > target.width * 2 && currentSize.height > target.height * 2) {
    const width = Math.max(target.width, Math.round(currentSize.width / 2));
    const height = Math.max(target.height, Math.round(currentSize.height / 2));
    current = paint(current, width, height);
    currentSize = { width, height };
  }

  return paint(current, target.width, target.height);
}

async function renderImage(job: ImageJob): Promise<ImageDone> {
  const bitmap = await createImageBitmap(job.blob);
  const size = { width: bitmap.width, height: bitmap.height };

  try {
    const thumbCanvas = downscale(bitmap, size, fitDimensions(size.width, size.height, job.thumbMax));
    const thumb = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: job.thumbQuality });

    const previewTarget = fitDimensions(size.width, size.height, job.previewMax);
    const previewCanvas = downscale(thumbCanvas, { width: thumbCanvas.width, height: thumbCanvas.height }, previewTarget);
    const preview = await previewCanvas.convertToBlob({ type: 'image/jpeg', quality: job.previewQuality });

    return {
      id: job.id,
      ok: true,
      kind: 'image',
      thumb,
      thumbHash: await hashBlobInWorker(thumb),
      preview,
      width: size.width,
      height: size.height,
    };
  } finally {
    bitmap.close();
  }
}

self.addEventListener('message', (event: MessageEvent<MediaJob>) => {
  const job = event.data;

  const run = job.kind === 'hash' ? hashJob(job) : renderImage(job);

  run
    .then((result: MediaJobResult) => self.postMessage(result))
    .catch((error: unknown) => {
      const failed: JobFailed = {
        id: job.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Не удалось обработать файл',
      };
      self.postMessage(failed);
    });
});

async function hashJob(job: HashJob): Promise<HashDone> {
  return { id: job.id, ok: true, kind: 'hash', hash: await hashBlobInWorker(job.blob) };
}
