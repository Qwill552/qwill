import type { IpBanDto, IpBanDurationDays } from '@messenger/shared';

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function durationLabel(days: IpBanDurationDays): string {
  if (days === null) return 'Навсегда';
  if (days === 1) return '1 день';
  if (days === 90) return '90 дней';
  return `${days} дней`;
}

export function banUntilText(ban: IpBanDto): string {
  return ban.expiresAt ? `до ${formatDateTime(ban.expiresAt)}` : 'бессрочно';
}

export function banStateText(ban: IpBanDto): string {
  if (ban.liftedAt) return `Снята ${formatDateTime(ban.liftedAt)}`;
  if (ban.active) return `Действует ${banUntilText(ban)}`;
  return `Истекла ${ban.expiresAt ? formatDateTime(ban.expiresAt) : ''}`.trim();
}

export function banAuthorText(ban: IpBanDto): string {
  return ban.createdByUsername ? `@${ban.createdByUsername}` : 'неизвестно кем';
}

export function banLifterText(ban: IpBanDto): string {
  return ban.liftedByUsername ? `@${ban.liftedByUsername}` : 'из консоли';
}
