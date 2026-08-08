/** Ограничения, о которых должны одинаково знать сервер и клиент. */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
/** Латиница, цифры, подчёркивание. Хранится в нижнем регистре, неизменяем (секция 2). */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 64;

export const CHAT_TITLE_MAX_LENGTH = 128;
export const MESSAGE_MAX_LENGTH = 4096;

/** Курсорная пагинация истории (секция 4: виртуализация не нужна при таком шаге). */
export const MESSAGES_PAGE_SIZE = 50;

/** Максимум строк в ответе на GET /users/search (этап 8). */
export const USER_SEARCH_PAGE_SIZE = 20;

/** Через столько миллисекунд без событий индикатор «печатает» гаснет сам. */
export const TYPING_TIMEOUT_MS = 5_000;

/**
 * Белый список MIME-типов для вложений (секция 7). Сервер дополнительно проверяет
 * содержимое по сигнатуре — этот список используется и там, и для accept= на клиенте.
 */
export const ALLOWED_MIME_TYPES = [
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
  'application/pdf',
  'application/zip',
  'text/plain',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Аватар — только изображения (секция 7). */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Значения по умолчанию — сервер авторитетен (реальные лимиты берёт из env), это только для быстрой UX-проверки на клиенте до хэширования. */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_AVATAR_SIZE_BYTES = 50 * 1024 * 1024;
export const DEFAULT_UPLOAD_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

/** Сторона сообщает реальное смещение уже принятых байт клиенту при обрыве и докачке (секция 7). */
export const UPLOAD_OFFSET_HEADER = 'x-upload-offset';

/** Не больше стольки пикселей по длинной стороне у превью, снятого клиентом через canvas (секция 7). */
export const THUMBNAIL_MAX_DIMENSION = 320;

/** Дефолты быстрой панели реакций и двойного тапа (этап 8, ux-ui/08-emoji.md). Реакция
 *  сама по себе больше не ограничена этим набором — любой эмодзи из панели годится
 *  (см. messageReactSchema); это только первые 8 кнопок быстрой панели и клиентский
 *  дефолт до появления своей настройки в UserSettingsDTO на этапе 11. */
export const DEFAULT_QUICK_REACTIONS = ['❤️', '👍', '🔥', '😁', '😢', '🙏', '👏', '😱'] as const;
export const DEFAULT_DOUBLE_TAP_REACTION = '❤️';

/** Максимум сообщений в одной групповой операции (удалить/переслать разом, этап 6) —
 *  тот же порядок величины, что и страница ленты. */
export const MESSAGE_BATCH_LIMIT = MESSAGES_PAGE_SIZE;
