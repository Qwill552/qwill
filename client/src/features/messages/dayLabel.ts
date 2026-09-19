import {
  formatDayMonthLong,
  formatDayMonthLongYear,
  formatDayMonthShort,
  formatDayMonthShortYear,
  formatDayMonthYearDigits,
  formatHourMinute,
  formatWeekdayLong,
  formatWeekdayShort,
} from '../../utils/dateFormats';

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysBetween(now: Date, date: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = daysBetween(now, date);

  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  if (diff >= 2 && diff < 7) return capitalize(formatWeekdayLong(date));
  if (date.getFullYear() === now.getFullYear())
    return formatDayMonthLong(date);
  return formatDayMonthLongYear(date);
}

export function formatAttachmentDateTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = formatHourMinute(date);
  if (daysBetween(now, date) === 0) return `сегодня в ${time}`;
  const day =
    date.getFullYear() === now.getFullYear()
      ? formatDayMonthShort(date)
      : formatDayMonthShortYear(date);
  return `${day} в ${time}`;
}

export function formatChatRowWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = daysBetween(now, date);

  if (diff === 0) return formatHourMinute(date);
  if (diff === 1) return 'вчера';
  if (diff >= 2 && diff < 7) return formatWeekdayShort(date);
  if (date.getFullYear() === now.getFullYear())
    return formatDayMonthShort(date);
  return formatDayMonthYearDigits(date);
}
