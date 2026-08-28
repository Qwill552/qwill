import { z } from 'zod';

import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PHONE_MAX_LENGTH,
  PHONE_MIN_LENGTH,
  PHONE_PATTERN,
} from './constants.js';

const birthdaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Неверный формат даты')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Неверная дата');

const phoneSchema = z
  .string()
  .trim()
  .min(PHONE_MIN_LENGTH, `Телефон не короче ${PHONE_MIN_LENGTH} символов`)
  .max(PHONE_MAX_LENGTH, `Телефон не длиннее ${PHONE_MAX_LENGTH} символов`)
  .regex(PHONE_PATTERN, 'Только цифры, пробелы, +, скобки и дефисы');

const bioSchema = z.string().trim().max(BIO_MAX_LENGTH, `Не длиннее ${BIO_MAX_LENGTH} символов`);

/** Что показывать вместо «О себе»: обычный текст (`User.bio`) или HTML-визитку (`ProfileCard`).
 *  Черновики обоих режимов живут одновременно, переключение ничего не стирает (R-30). */
export const BIO_MODE_VALUES = ['text', 'html'] as const;
export type BioMode = (typeof BIO_MODE_VALUES)[number];

export function toBioMode(value: string): BioMode {
  return (BIO_MODE_VALUES as readonly string[]).includes(value) ? (value as BioMode) : 'text';
}

/** Правка профиля — username неизменяем; аватар меняется отдельным proof-of-possession
 *  эндпоинтом (setAvatarSchema), сюда не входит (этап 8). */
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN_LENGTH, 'Введите имя')
    .max(DISPLAY_NAME_MAX_LENGTH, `Имя не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов`)
    .optional(),
  phone: phoneSchema.nullable().optional(),
  birthday: birthdaySchema.nullable().optional(),
  bio: bioSchema.nullable().optional(),
  bioMode: z.enum(BIO_MODE_VALUES).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export interface UpdateProfileDTO {
  displayName?: string;
  phone?: string | null;
  birthday?: string | null;
  bio?: string | null;
  bioMode?: BioMode;
}

export interface UserProfileDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
  lastSeenAt: string;
  phone: string | null;
  birthday: string | null;
  bio: string | null;
  bioMode: BioMode;
  /** Полный адрес документа визитки на CARD_ORIGIN вместе с версией, либо null, если
   *  показывать нечего. Собирается сервером — клиент домена песочницы не знает и знать
   *  не должен: это единственная точка, где сходятся режим, рубильники и бан (R-30). */
  cardUrl: string | null;
}

export interface ProfileCardPreviewDto {
  token: string;
  url: string;
}

/** Роль хранится строкой в `User.role` и проверяется на сервере походом в базу на каждый
 *  запрос — не выводится из username и не кладётся в access-токен (R-32A). */
export const USER_ROLE_VALUES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLE_VALUES)[number];

export function toUserRole(value: string): UserRole {
  return (USER_ROLE_VALUES as readonly string[]).includes(value) ? (value as UserRole) : 'user';
}

/** Имена, под которыми нельзя зарегистрироваться: посторонний не должен выдавать себя за
 *  администрацию. Проверяются только при регистрации — существующие записи не валидируются
 *  и не переименовываются (R-32A). */
export const RESERVED_USERNAMES = [
  'qwill',
  'admin',
  'administrator',
  'administration',
  'support',
  'moderator',
  'mod',
  'system',
  'root',
  'staff',
  'team',
  'official',
  'security',
  'abuse',
  'help',
  'info',
  'service',
  'bot',
  'null',
  'undefined',
] as const;

export function isReservedUsername(username: string): boolean {
  return (RESERVED_USERNAMES as readonly string[]).includes(username.trim().toLowerCase());
}

export const THEME_VALUES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_VALUES)[number];

export const FONT_SIZE_VALUES = ['small', 'medium', 'large'] as const;
export type FontSize = (typeof FONT_SIZE_VALUES)[number];

/** Режим оформления: 'glass' — прозрачные поверхности с размытием, 'solid' — непрозрачные с границами.
 *  Ортогонален теме: обе темы работают в обоих режимах (UI-1). */
export const SURFACE_VALUES = ['glass', 'solid'] as const;
export type SurfaceMode = (typeof SURFACE_VALUES)[number];

/** Цвет буквенного аватара — назначается один раз при регистрации (server/src/services/user.ts,
 *  randomAvatarColor) и хранится на пользователе, а не пересчитывается хешем на клиенте, иначе
 *  один и тот же человек красится по-разному в разных местах интерфейса. Порядок и состав
 *  буквально совпадают с client/src/ui/tint.ts (AVATAR_GRADIENTS). */
export const AVATAR_COLOR_VALUES = ['blue', 'violet', 'teal', 'orange', 'pink', 'green'] as const;
export type AvatarColor = (typeof AVATAR_COLOR_VALUES)[number];

export const updateSettingsSchema = z.object({
  theme: z.enum(THEME_VALUES).optional(),
  fontSize: z.enum(FONT_SIZE_VALUES).optional(),
  surface: z.enum(SURFACE_VALUES).optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export interface UserSettingsDTO {
  theme: ThemePreference;
  fontSize: FontSize;
  surface: SurfaceMode;
}
