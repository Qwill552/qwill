import { formatDayMonthLongYearUtc, formatDayMonthShort, formatHourMinute } from './dateFormats';

/** «был(а) в 21:47» сегодня, «был(а) 3 авг в 21:47» в остальные дни — общий формат для шапки
 *  чата и профиля собеседника (переиспользуется ChatScreen и ChatInfoScreen). */
export function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  const time = formatHourMinute(date);
  const today = new Date().toDateString() === date.toDateString();
  if (today) return `был(а) в ${time}`;
  const day = formatDayMonthShort(date);
  return `был(а) ${day} в ${time}`;
}

export function formatBirthday(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return formatDayMonthLongYearUtc(date);
}
