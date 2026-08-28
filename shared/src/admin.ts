import { z } from 'zod';

import type { UserRole } from './user.js';

export const REPORT_KIND_VALUES = ['card', 'message', 'profile'] as const;
export type ReportKind = (typeof REPORT_KIND_VALUES)[number];

export const REPORT_STATUS_VALUES = ['new', 'working', 'closed'] as const;
export type ReportStatus = (typeof REPORT_STATUS_VALUES)[number];

/** Больше пяти жалоб в сутки от одного человека — уже не сигнал, а инструмент травли. */
export const REPORTS_PER_DAY_LIMIT = 5;
export const REPORT_COMMENT_MAX_LENGTH = 1000;
export const BAN_REASON_MAX_LENGTH = 500;

/** Ключ глобального рубильника визиток в AppSetting; значение — "true"/"false". */
export const PROFILE_CARDS_SETTING_KEY = 'profileCardsEnabled';

export const createReportSchema = z.object({
  targetUserId: z.string().min(1),
  kind: z.enum(REPORT_KIND_VALUES),
  comment: z
    .string()
    .trim()
    .min(1, 'Опишите, что не так')
    .max(REPORT_COMMENT_MAX_LENGTH, `Не длиннее ${REPORT_COMMENT_MAX_LENGTH} символов`),
  targetChatId: z.string().min(1).nullish(),
  targetMessageId: z.number().int().positive().nullish(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const banUserSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Укажите причину')
    .max(BAN_REASON_MAX_LENGTH, `Не длиннее ${BAN_REASON_MAX_LENGTH} символов`),
});
export type BanUserInput = z.infer<typeof banUserSchema>;

export const setUserCardSchema = z.object({ disabled: z.boolean() });
export type SetUserCardInput = z.infer<typeof setUserCardSchema>;

export const setProfileCardsSchema = z.object({ enabled: z.boolean() });
export type SetProfileCardsInput = z.infer<typeof setProfileCardsSchema>;

export const reportListQuerySchema = z.object({
  status: z.enum(REPORT_STATUS_VALUES).optional(),
});
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;

/** Карточка пользователя в администрировании — модерационные поля, без passwordHash и без
 *  чего-либо из переписки. */
export interface AdminUserDto {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  bannedAt: string | null;
  bannedReason: string | null;
  cardDisabled: boolean;
  mustChangePassword: boolean;
}

export interface AdminReportDto {
  id: string;
  reporterId: string;
  reporterUsername: string;
  targetUserId: string;
  targetUsername: string;
  targetChatId: string | null;
  targetMessageId: number | null;
  kind: ReportKind;
  comment: string;
  status: ReportStatus;
  resolution: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface AdminSettingsDto {
  profileCardsEnabled: boolean;
}
