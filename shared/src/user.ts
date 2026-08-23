import { z } from 'zod';

import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from './constants.js';

/** Правка профиля — username неизменяем; аватар меняется отдельным proof-of-possession
 *  эндпоинтом (setAvatarSchema), сюда не входит (этап 8). */
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN_LENGTH, 'Введите имя')
    .max(DISPLAY_NAME_MAX_LENGTH, `Имя не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов`)
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export interface UpdateProfileDTO {
  displayName?: string;
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
