import {
  blurhashSchema,
  ErrorCode,
  PROCESSED_IMAGE_MAX_FRAMES,
  PROCESSED_IMAGE_MAX_PIXELS,
  PROCESSED_IMAGE_MAX_SIDE,
} from '@messenger/shared';
import { encode as encodeBlurhash } from 'blurhash';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import { AppError, tooLarge } from './errors.js';

const FORMATS = {
  png: { mime: 'image/png', ext: 'png' },
  jpg: { mime: 'image/jpeg', ext: 'jpg' },
  webp: { mime: 'image/webp', ext: 'webp' },
  gif: { mime: 'image/gif', ext: 'gif' },
} as const;

type ProcessableFormat = keyof typeof FORMATS;

const MIME_TO_FORMAT: Record<string, ProcessableFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const PROCESSABLE_IMAGE_MIME_TYPES = Object.keys(MIME_TO_FORMAT);

export function isProcessableImageMimeType(mimeType: string): boolean {
  return mimeType in MIME_TO_FORMAT;
}

export interface ProcessedImage {
  data: Buffer;
  mime: string;
  ext: string;
  width: number;
  height: number;
  frames: number;
}

const BLURHASH_SIDE = 32;
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;

export async function computeBlurhash(input: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(input, { failOn: 'none' })
      .resize(BLURHASH_SIDE, BLURHASH_SIDE, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hash = encodeBlurhash(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      BLURHASH_COMPONENTS_X,
      BLURHASH_COMPONENTS_Y,
    );
    return blurhashSchema.safeParse(hash).success ? hash : null;
  } catch {
    return null;
  }
}

export interface ProcessImageOptions {
  maxDimension: number;
  maxBytes: number;
}

function unsupported(message: string): AppError {
  return new AppError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415, message);
}

function toMegabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function encode(pipeline: sharp.Sharp, format: ProcessableFormat): sharp.Sharp {
  switch (format) {
    case 'png':
      return pipeline.png({ compressionLevel: 9 });
    case 'jpg':
      return pipeline.jpeg({ quality: 90 });
    case 'webp':
      return pipeline.webp({ quality: 90 });
    case 'gif':
      return pipeline.gif();
  }
}

export async function processImage(input: Buffer, options: ProcessImageOptions): Promise<ProcessedImage> {
  if (input.length > options.maxBytes) {
    throw tooLarge(`Картинка больше ${toMegabytes(options.maxBytes)} МБ`);
  }

  const sniffed = await fileTypeFromBuffer(input);
  const format = sniffed ? MIME_TO_FORMAT[sniffed.mime] : undefined;
  if (!format) {
    throw unsupported('Картинка должна быть PNG, JPEG, WebP или GIF');
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw unsupported('Картинка повреждена и не читается');
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const frames = meta.pages ?? 1;

  if (width < 1 || height < 1) {
    throw unsupported('Картинка повреждена и не читается');
  }
  if (width > PROCESSED_IMAGE_MAX_SIDE || height > PROCESSED_IMAGE_MAX_SIDE) {
    throw unsupported(`Сторона картинки больше ${PROCESSED_IMAGE_MAX_SIDE} px`);
  }
  if (frames > PROCESSED_IMAGE_MAX_FRAMES) {
    throw unsupported(`Кадров больше ${PROCESSED_IMAGE_MAX_FRAMES}`);
  }
  if (width * height * frames > PROCESSED_IMAGE_MAX_PIXELS) {
    throw unsupported('Картинка слишком большая по числу пикселей');
  }

  const animated = frames > 1;
  let data: Buffer;
  try {
    const pipeline = sharp(input, {
      limitInputPixels: PROCESSED_IMAGE_MAX_PIXELS,
      failOn: 'error',
      animated,
    }).resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });
    data = await encode(pipeline, format).toBuffer();
  } catch {
    throw unsupported('Не удалось обработать картинку');
  }

  const outMeta = await sharp(data).metadata();
  return {
    data,
    mime: FORMATS[format].mime,
    ext: FORMATS[format].ext,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    frames: outMeta.pages ?? 1,
  };
}
