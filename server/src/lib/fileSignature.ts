/**
 * Проверка по сигнатуре файла, а не по расширению/заголовку от клиента (секция 7).
 * Клиент может соврать про Content-Type — реальный тип определяется по первым байтам.
 */

interface Signature {
  mime: string;
  check: (b: Buffer) => boolean;
}

const SIGNATURES: Signature[] = [
  { mime: 'image/jpeg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    check: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/gif',
    check: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')),
  },
  {
    mime: 'image/webp',
    check: (b) =>
      b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'video/mp4', check: (b) => b.length >= 8 && b.subarray(4, 8).toString('ascii') === 'ftyp' },
  {
    mime: 'video/webm',
    check: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
  {
    mime: 'audio/mpeg',
    check: (b) =>
      b.length >= 3 &&
      ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)),
  },
  { mime: 'audio/ogg', check: (b) => b.length >= 4 && b.subarray(0, 4).toString('ascii') === 'OggS' },
  {
    mime: 'audio/wav',
    check: (b) =>
      b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE',
  },
  { mime: 'application/pdf', check: (b) => b.length >= 4 && b.subarray(0, 4).toString('ascii') === '%PDF' },
  {
    mime: 'application/zip',
    check: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && [0x03, 0x05, 0x07].includes(b[2] ?? -1),
  },
];

/** Возвращает MIME по магическим байтам или null, если сигнатура не распознана (секция 7). */
export function sniffMimeType(head: Buffer): string | null {
  for (const signature of SIGNATURES) {
    if (signature.check(head)) return signature.mime;
  }
  return null;
}

const CONTAINER_FAMILIES: Record<string, readonly string[]> = {
  'video/webm': ['video/webm', 'audio/webm', 'video/x-matroska', 'video/matroska'],
  'video/mp4': ['video/mp4', 'audio/mp4'],
};

export function resolveContainerMimeType(sniffed: string, declaredMimeType: string): string {
  const family = CONTAINER_FAMILIES[sniffed];
  return family?.includes(declaredMimeType) ? declaredMimeType : sniffed;
}
