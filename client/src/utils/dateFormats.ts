const LOCALE = 'ru-RU';

function lazyFormat(options: Intl.DateTimeFormatOptions): (date: Date) => string {
  let formatter: Intl.DateTimeFormat | null = null;
  return (date) => (formatter ??= new Intl.DateTimeFormat(LOCALE, options)).format(date);
}

export const formatHourMinute = lazyFormat({ hour: '2-digit', minute: '2-digit' });
export const formatWeekdayLong = lazyFormat({ weekday: 'long' });
export const formatWeekdayShort = lazyFormat({ weekday: 'short' });
export const formatMonthLong = lazyFormat({ month: 'long' });
export const formatDayMonthLong = lazyFormat({ day: 'numeric', month: 'long' });
export const formatDayMonthLongYear = lazyFormat({ day: 'numeric', month: 'long', year: 'numeric' });
export const formatDayMonthShort = lazyFormat({ day: 'numeric', month: 'short' });
export const formatDayMonthShortYear = lazyFormat({ day: 'numeric', month: 'short', year: 'numeric' });
export const formatDayMonthYearDigits = lazyFormat({ day: '2-digit', month: '2-digit', year: '2-digit' });
export const formatDayMonthLongYearUtc = lazyFormat({
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
