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

/** Запасная ширина коробки в CSS-пикселях, когда настоящая ещё не измерена: пузырь с
 *  картинкой на телефоне около 256, на широком экране 333. */
export const FEED_BUBBLE_CSS_WIDTH = 320;

/** Превью в 512 px хватает только экрану с плотностью 1. На телефоне с плотностью 3 пузырь
 *  просит около 960 настоящих пикселей, и превью растягивается втрое — отсюда «мыло»
 *  (замерено на Pixel 9 Pro: картинка 229×512 в коробке 256×571 при dpr 3). Для таких
 *  экранов в ленту идёт миниатюра 1280 px: она уже загружена в тех же чатах, весит
 *  40-70 КБ против 6-14 КБ у превью и против 0.4-1.7 МБ у оригинала. */
export function prefersThumbnailInFeed(
  attachment: AttachmentDto,
  pixelRatio = window.devicePixelRatio,
  boxCssWidth = FEED_BUBBLE_CSS_WIDTH,
): boolean {
  if (attachment.thumbnail === null) return false;
  const kind = categorizeAttachment(attachment.file.mimeType, attachment.peaks);
  if (kind !== 'photo' && kind !== 'video' && kind !== 'gif') return false;
  return boxCssWidth * pixelRatio > PREVIEW_MAX_DIMENSION;
}

export function feedFileIdOf(
  attachment: AttachmentDto,
  pixelRatio = window.devicePixelRatio,
  boxCssWidth = FEED_BUBBLE_CSS_WIDTH,
): string {
  if (prefersOriginalInFeed(attachment)) return attachment.file.id;
  if (prefersThumbnailInFeed(attachment, pixelRatio, boxCssWidth)) return attachment.thumbnail!.id;
  return attachment.preview?.id ?? attachment.thumbnail?.id ?? attachment.file.id;
}

export function feedUsesDownscaled(attachment: AttachmentDto): boolean {
  return !prefersOriginalInFeed(attachment) && Boolean(attachment.preview ?? attachment.thumbnail);
}
