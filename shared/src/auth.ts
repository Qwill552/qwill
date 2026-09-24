import { z } from 'zod';

import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from './constants.js';
import type { PendingConsentDto } from './legal.js';
import { isReservedUsername, type AvatarColor, type UserRole } from './user.js';

/** `@username` неизменяем после регистрации — хранится и сравнивается в нижнем регистре (секция 2). */
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH, `Имя пользователя не короче ${USERNAME_MIN_LENGTH} символов`)
  .max(USERNAME_MAX_LENGTH, `Имя пользователя не длиннее ${USERNAME_MAX_LENGTH} символов`)
  .regex(USERNAME_PATTERN, 'Только латиница, цифры и подчёркивание');

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Пароль не короче ${PASSWORD_MIN_LENGTH} символов`)
  .max(PASSWORD_MAX_LENGTH, `Пароль не длиннее ${PASSWORD_MAX_LENGTH} символов`);

export const registerSchema = z.object({
  username: usernameSchema.refine(
    (value) => !isReservedUsername(value),
    'Это имя пользователя занято сервисом',
  ),
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN_LENGTH, 'Введите имя')
    .max(DISPLAY_NAME_MAX_LENGTH, `Имя не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов`),
  termsVersion: z.string().min(1, 'Примите условия регистрации'),
  privacyVersion: z.string().min(1, 'Примите условия регистрации'),
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Введите пароль'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: passwordSchema,
  refreshToken: z.string().min(1).optional(),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface ChangePasswordResponse {
  terminatedSessions: number;
}

export const refreshSchema = z.object({
  // Кука — основной путь в браузере; тело — для Capacitor, где кука сторонняя (секция 6).
  refreshToken: z.string().min(1).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Пользователь без passwordHash — единственная форма, в которой User покидает сервер. */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
  theme: string;
  createdAt: string;
  lastSeenAt: string;
  /** Только для отрисовки кнопок: права проверяет сервер, подмена поля в ответе ничего не даёт. */
  role: UserRole;
  /** Визитка выключена администрацией: редактор HTML заперт, режим «О себе» переключить нельзя.
   *  Отдаётся только про себя — `toPublicUser` не применяется к чужим пользователям. */
  cardDisabled: boolean;
  pendingConsent: PendingConsentDto | null;
}

export const SESSION_MODE_HEADER = 'x-qwill-session';
export const SESSION_MODE_BODY = 'body';

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
  csrfToken: string;
  refreshToken?: string;
}
