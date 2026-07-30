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

/** Через столько миллисекунд без событий индикатор «печатает» гаснет сам. */
export const TYPING_TIMEOUT_MS = 5_000;
