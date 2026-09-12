import { categorizeAttachment, PREVIEW_MAX_DIMENSION, type AttachmentDto } from '@messenger/shared';

/** Снимок «лёгкий», если оригинал не тяжелее этого и при этом не слишком большой по пикселям:
 *  байты решают про сеть, пиксели — про время разбора кадра в ленте (КЭШ-14). */
const LIGHT_ORIGINAL_MAX_BYTES = 400 * 1024;
const LIGHT_ORIGINAL_MAX_PIXELS = 5_000_000;

/** Превью 512 px / JPEG 0.7 выигрывает только у крупных снимков. У маленьких и лёгких оно
 *  портит картинку, ничего не экономя, — таким лента показывает сам оригинал. */
export function prefersOriginalInFeed(attachment: AttachmentDto): boolean {
  if (categorizeAttachment(attachment.file.mimeType, attachment.peaks) !== 'photo') return false;

  const { width, height } = attachment;
  if (!width || !height) return false;
  if (Math.max(width, height) <= PREVIEW_MAX_DIMENSION) return true;

  return attachment.file.size <= LIGHT_ORIGINAL_MAX_BYTES && width * height <= LIGHT_ORIGINAL_MAX_PIXELS;
}

export function feedFileIdOf(attachment: AttachmentDto): string {
  if (prefersOriginalInFeed(attachment)) return attachment.file.id;
  return attachment.preview?.id ?? attachment.thumbnail?.id ?? attachment.file.id;
}

export function feedUsesDownscaled(attachment: AttachmentDto): boolean {
  return !prefersOriginalInFeed(attachment) && Boolean(attachment.preview ?? attachment.thumbnail);
}
