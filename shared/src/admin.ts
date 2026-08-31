import { z } from 'zod';

import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from './constants.js';
import type { AvatarColor, BioMode, UserRole } from './user.js';

export const REPORT_KIND_VALUES = ['card', 'message', 'profile'] as const;
export type ReportKind = (typeof REPORT_KIND_VALUES)[number];

export const REPORT_STATUS_VALUES = ['new', 'working', 'closed'] as const;
export type ReportStatus = (typeof REPORT_STATUS_VALUES)[number];

/** Больше пяти жалоб в сутки от одного человека — уже не сигнал, а инструмент травли. */
export const REPORTS_PER_DAY_LIMIT = 5;
export const REPORT_COMMENT_MAX_LENGTH = 1000;
export const REPORT_RESOLUTION_MAX_LENGTH = 1000;
export const BAN_REASON_MAX_LENGTH = 500;

/** Ключ глобального рубильника визиток в AppSetting; значение — "true"/"false". */
export const PROFILE_CARDS_SETTING_KEY = 'profileCardsEnabled';

export const createReportSchema = z
  .object({
    targetUserId: z.string().min(1),
    kind: z.enum(REPORT_KIND_VALUES),
    comment: z
      .string()
      .trim()
      .min(1, 'Опишите, что не так')
      .max(REPORT_COMMENT_MAX_LENGTH, `Не длиннее ${REPORT_COMMENT_MAX_LENGTH} символов`),
    targetChatId: z.string().min(1).nullish(),
    targetMessageId: z.number().int().positive().nullish(),
  })
  .refine((value) => value.kind !== 'message' || (value.targetChatId && value.targetMessageId), {
    message: 'Жалоба на сообщение требует id чата и сообщения',
    path: ['targetChatId'],
  });
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const reportGroupViewSchema = z.object({
  view: z.enum(['open', 'closed']).default('open'),
});
export type ReportGroupView = z.infer<typeof reportGroupViewSchema>['view'];

export const markReportWorkingSchema = z.object({ status: z.literal('working') });

export const closeReportSchema = z.object({
  resolution: z
    .string()
    .trim()
    .min(1, 'Опишите решение')
    .max(REPORT_RESOLUTION_MAX_LENGTH, `Не длиннее ${REPORT_RESOLUTION_MAX_LENGTH} символов`),
});
export type CloseReportInput = z.infer<typeof closeReportSchema>;

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

export const muteSupportSchema = z.object({ until: z.string().datetime().nullable() });
export type MuteSupportInput = z.infer<typeof muteSupportSchema>;

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
  supportMutedUntil: string | null;
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

export interface ReportEntryDto {
  id: string;
  reporterId: string;
  reporterUsername: string;
  comment: string;
  targetMessageId: number | null;
  status: ReportStatus;
  createdAt: string;
}

/** Жалобы сгруппированы по объекту (kind + targetChatId для "message", targetUserId для
 *  "card"/"profile") — пять жалоб на одну визитку это одна группа с бейджем 5, а не пять строк. */
export interface ReportGroupDto {
  latestReportId: string;
  kind: ReportKind;
  targetUserId: string;
  targetUsername: string;
  targetDisplayName: string;
  targetAvatarUrl: string | null;
  targetAvatarColor: AvatarColor | null;
  targetChatId: string | null;
  chatTitle: string | null;
  chatAvatarUrl: string | null;
  openCount: number;
  hasNew: boolean;
  lastComment: string;
  lastCreatedAt: string;
  resolution: string | null;
  closedAt: string | null;
  reports: ReportEntryDto[];
}

export const ADMIN_PII_REVEAL_MS = 60_000;
export const ADMIN_LOG_PAGE_SIZE = 50;

export const ADMIN_ACTION_VALUES = [
  'user.ban',
  'user.unban',
  'user.card',
  'user.card.hide',
  'user.card.clear',
  'user.bio.clear',
  'user.displayName',
  'user.avatar.clear',
  'user.sessions.revoke',
  'user.pii.reveal',
  'user.support.mute',
  'settings.profileCards',
  'role.grant',
  'role.revoke',
  'report.working',
  'report.close',
] as const;
export type AdminActionName = (typeof ADMIN_ACTION_VALUES)[number];

export interface AdminUserCardDto {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastSeenAt: string;
  bannedAt: string | null;
  bannedReason: string | null;
  bannedByUsername: string | null;
  cardDisabled: boolean;
  mustChangePassword: boolean;
  supportMutedUntil: string | null;
  bioMode: BioMode;
  hasBio: boolean;
  hasCard: boolean;
  hasAvatar: boolean;
  chatCount: number;
  messageCount: number;
  reportsAgainst: number;
  reportsFiled: number;
  sessionCount: number;
}

export interface AdminSessionDto {
  id: string;
  createdAt: string;
  expiresAt: string;
  ip: string | null;
  lastSeenIp: string | null;
  userAgent: string | null;
}

export interface AdminPiiDto {
  signupIp: string | null;
  signupUserAgent: string | null;
  sessions: AdminSessionDto[];
}

export interface AdminLogEntryDto {
  id: string;
  createdAt: string;
  adminId: string;
  adminUsername: string | null;
  action: string;
  targetUserId: string | null;
  targetUsername: string | null;
  targetChatId: string | null;
  detail: string | null;
  ip: string;
  userAgent: string | null;
}

export interface AdminLogPageDto {
  entries: AdminLogEntryDto[];
  nextCursor: string | null;
}

export const adminUpdateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN_LENGTH, 'Введите имя')
    .max(DISPLAY_NAME_MAX_LENGTH, `Имя не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов`),
});
export type AdminUpdateProfileInput = z.infer<typeof adminUpdateProfileSchema>;

export const adminLogQuerySchema = z.object({
  admin: z.string().trim().min(1).max(64).optional(),
  action: z.string().trim().min(1).max(64).optional(),
  from: z.string().trim().min(1).max(32).optional(),
  to: z.string().trim().min(1).max(32).optional(),
  cursor: z.string().trim().min(1).max(64).optional(),
});
export type AdminLogQuery = z.infer<typeof adminLogQuerySchema>;
