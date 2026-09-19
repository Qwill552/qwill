import { describe, expect, it } from 'vitest';

import {
  formatDayMonthLong,
  formatDayMonthLongYear,
  formatDayMonthLongYearUtc,
  formatDayMonthShort,
  formatDayMonthShortYear,
  formatDayMonthYearDigits,
  formatHourMinute,
  formatMonthLong,
  formatWeekdayLong,
  formatWeekdayShort,
} from './dateFormats';

const DATES = [
  new Date('2026-01-05T09:07:00.000Z'),
  new Date('2026-06-30T23:59:00.000Z'),
  new Date('2025-11-03T00:00:00.000Z'),
];

describe('кэшированные форматтеры дат', () => {
  it('дают то же, что toLocale*String с теми же настройками', () => {
    for (const date of DATES) {
      expect(formatHourMinute(date)).toBe(date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      expect(formatWeekdayLong(date)).toBe(date.toLocaleDateString('ru-RU', { weekday: 'long' }));
      expect(formatWeekdayShort(date)).toBe(date.toLocaleDateString('ru-RU', { weekday: 'short' }));
      expect(formatMonthLong(date)).toBe(date.toLocaleDateString('ru-RU', { month: 'long' }));
      expect(formatDayMonthLong(date)).toBe(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }));
      expect(formatDayMonthLongYear(date)).toBe(
        date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
      );
      expect(formatDayMonthShort(date)).toBe(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
      expect(formatDayMonthShortYear(date)).toBe(
        date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
      );
      expect(formatDayMonthYearDigits(date)).toBe(
        date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      );
      expect(formatDayMonthLongYearUtc(date)).toBe(
        date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
      );
    }
  });

  it('переиспользуют один форматтер, а не строят его на каждый вызов', () => {
    formatHourMinute(DATES[0]!);

    const constructed: Intl.DateTimeFormatOptions[] = [];
    const Original = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function patched(
      locale?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): Intl.DateTimeFormat {
      if (options) constructed.push(options);
      return new Original(locale, options);
    } as unknown as typeof Intl.DateTimeFormat;

    try {
      for (const date of DATES) formatHourMinute(date);
    } finally {
      Intl.DateTimeFormat = Original;
    }

    expect(constructed).toHaveLength(0);
  });
});
