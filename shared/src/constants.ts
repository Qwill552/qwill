/** Ограничения, о которых должны одинаково знать сервер и клиент. */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
/** Латиница, цифры, подчёркивание. Хранится в нижнем регистре, неизменяем (секция 2). */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const ADMIN_PASSWORD_MIN_LENGTH = 24;

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 64;

export const BIO_MAX_LENGTH = 89;

/** Предел HTML-визитки, в байтах UTF-8, а не в символах: тело маршрута читается
 *  своим `express.text`, общий `express.json({ limit: '1mb' })` под неё не поднимается (R-30). */
export const PROFILE_CARD_MAX_BYTES = 2 * 1024 * 1024;

export const PHONE_MIN_LENGTH = 5;
export const PHONE_MAX_LENGTH = 32;
export const PHONE_PATTERN = /^[0-9+()\-\s]+$/;

export const CHAT_TITLE_MAX_LENGTH = 128;
export const MESSAGE_MAX_LENGTH = 4096;

/** Курсорная пагинация истории (секция 4: виртуализация не нужна при таком шаге). */
export const MESSAGES_PAGE_SIZE = 50;

/** Максимум строк на секцию в ответе на GET /search (этап 4). */
export const SEARCH_PAGE_SIZE = 20;

/** Курсорная пагинация поиска внутри чата (R-33). */
export const CHAT_SEARCH_PAGE_SIZE = 30;

/** Через столько миллисекунд без событий индикатор «печатает» гаснет сам. */
export const TYPING_TIMEOUT_MS = 5_000;

export const INLINE_SAFE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/mp4',
] as const;

export function isInlineSafeMimeType(mimeType: string): boolean {
  const safe: readonly string[] = INLINE_SAFE_MIME_TYPES;
  return safe.includes(mimeType);
}

/** Аватар — только изображения (секция 7). GIF идёт мимо кроппера (files.ts, isGifFile) —
 *  канвас плющит анимацию до одного кадра, поэтому загружается как есть. */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Значения по умолчанию — сервер авторитетен (реальные лимиты берёт из env), это только для быстрой UX-проверки на клиенте до хэширования. */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_AVATAR_SIZE_BYTES = 50 * 1024 * 1024;
export const DEFAULT_UPLOAD_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

/** Сторона сообщает реальное смещение уже принятых байт клиенту при обрыве и докачке (секция 7). */
export const UPLOAD_OFFSET_HEADER = 'x-upload-offset';

/** Не больше стольки пикселей по длинной стороне у превью, снятого клиентом через canvas (секция 7). */
export const THUMBNAIL_MAX_DIMENSION = 1280;
export const THUMBNAIL_JPEG_QUALITY = 0.85;

export const PREVIEW_MAX_DIMENSION = 512;
export const PREVIEW_JPEG_QUALITY = 0.7;

export const AVATAR_MAX_DIMENSION = 1024;
export const AVATAR_JPEG_QUALITY = 0.9;

/** Дефолты быстрой панели реакций и двойного тапа (этап 8, ux-ui/08-emoji.md). Реакция
 *  сама по себе больше не ограничена этим набором — любой эмодзи из панели годится
 *  (см. messageReactSchema); это только первые 8 кнопок быстрой панели и клиентский
 *  дефолт до появления своей настройки в UserSettingsDTO на этапе 11. */
export const DEFAULT_QUICK_REACTIONS = ['❤️', '👍', '🔥', '😁', '😢', '🙏', '👏', '😱'] as const;
export const DEFAULT_DOUBLE_TAP_REACTION = '❤️';

/** Максимум сообщений в одной групповой операции (удалить/переслать разом, этап 6) —
 *  тот же порядок величины, что и страница ленты. */
export const MESSAGE_BATCH_LIMIT = MESSAGES_PAGE_SIZE;

export const CARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CARD_IMAGE_MAX_COUNT = 50;
export const CARD_IMAGE_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
export const CARD_IMAGE_MAX_DIMENSION = 2048;
export const CARD_IMAGE_UPLOADS_PER_DAY = 40;

export const AVATAR_STORED_MAX_DIMENSION = 512;

export const PROCESSED_IMAGE_MAX_SIDE = 8000;
export const PROCESSED_IMAGE_MAX_FRAMES = 300;
export const PROCESSED_IMAGE_MAX_PIXELS = 100_000_000;
