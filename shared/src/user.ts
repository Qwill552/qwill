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

/** Поиск по подстроке username — минимум 2 символа против полного скана таблицы на каждое нажатие (этап 8). */
export const searchUsersQuerySchema = z.object({
  q: z.string().trim().min(2, 'Минимум 2 символа'),
});
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;

/** isContact — уже есть приватный чат с этим пользователем (в приложении нет отдельного понятия «контакт»). */
export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isContact: boolean;
}
