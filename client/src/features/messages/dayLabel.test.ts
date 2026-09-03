import { describe, expect, it } from 'vitest';

import { formatAttachmentDateTime, formatChatRowWhen, formatDayLabel } from './dayLabel';

const NOW = new Date(2026, 7, 27, 15, 0, 0);

function isoDaysAgo(days: number, hour = 10, minute = 0): string {
  const date = new Date(NOW);
  date.setDate(NOW.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

describe('formatDayLabel', () => {
  it('сегодня — независимо от времени суток', () => {
    expect(formatDayLabel(isoDaysAgo(0, 23, 59), NOW)).toBe('Сегодня');
    expect(formatDayLabel(isoDaysAgo(0, 0, 0), NOW)).toBe('Сегодня');
  });

  it('вчера — даже поздним вечером, а не через 24 часа', () => {
    expect(formatDayLabel(isoDaysAgo(1, 23, 0), NOW)).toBe('Вчера');
  });

  it('2…6 дней назад — день недели полностью, с заглавной буквы', () => {
    expect(formatDayLabel(isoDaysAgo(2), NOW)).toBe('Вторник');
    expect(formatDayLabel(isoDaysAgo(6), NOW)).toBe('Пятница');
  });

  it('7 дней и старше в этом году — дата без года', () => {
    expect(formatDayLabel(isoDaysAgo(7), NOW)).toBe('20 августа');
  });

  it('прошлый год и раньше — дата с годом', () => {
    const lastYear = new Date(2025, 7, 27, 10, 0, 0).toISOString();
    const result = formatDayLabel(lastYear, NOW);
    expect(result).toContain('августа');
    expect(result).toContain('2025');
  });
});

describe('formatChatRowWhen', () => {
  it('сегодня — время часами и минутами', () => {
    expect(formatChatRowWhen(isoDaysAgo(0, 14, 32), NOW)).toBe('14:32');
  });

  it('вчера — короткое слово', () => {
    expect(formatChatRowWhen(isoDaysAgo(1, 23, 0), NOW)).toBe('вчера');
  });

  it('2…6 дней назад — день недели коротко, строчными', () => {
    expect(formatChatRowWhen(isoDaysAgo(2), NOW)).toBe('вт');
    expect(formatChatRowWhen(isoDaysAgo(6), NOW)).toBe('пт');
  });

  it('7 дней и старше в этом году — число и месяц сокращённо', () => {
    expect(formatChatRowWhen(isoDaysAgo(7), NOW)).toBe('20 авг.');
  });

  it('прошлый год и раньше — числовая дата с годом', () => {
    const old = new Date(2024, 2, 5, 10, 0, 0).toISOString();
    expect(formatChatRowWhen(old, NOW)).toBe('05.03.24');
  });

  it('граница считается по календарным дням, а не по 168 часам', () => {
    const lateYesterdayEvening = isoDaysAgo(1, 23, 55);
    const earlyTodayMorning = new Date(NOW);
    earlyTodayMorning.setHours(0, 5, 0, 0);
    expect(formatChatRowWhen(lateYesterdayEvening, earlyTodayMorning)).toBe('вчера');
  });
});

describe('formatAttachmentDateTime', () => {
  it('сегодня — «сегодня в ЧЧ:ММ», независимо от времени суток', () => {
    expect(formatAttachmentDateTime(isoDaysAgo(0, 16, 33), NOW)).toBe('сегодня в 16:33');
    expect(formatAttachmentDateTime(isoDaysAgo(0, 0, 5), NOW)).toBe('сегодня в 00:05');
  });

  it('граница считается по календарным дням, а не по 24 часам', () => {
    const lateYesterdayEvening = isoDaysAgo(1, 23, 55);
    const earlyTodayMorning = new Date(NOW);
    earlyTodayMorning.setHours(0, 5, 0, 0);
    expect(formatAttachmentDateTime(lateYesterdayEvening, earlyTodayMorning)).not.toContain('сегодня');
  });

  it('вчера и раньше в этом году — число и месяц сокращённо, с временем', () => {
    expect(formatAttachmentDateTime(isoDaysAgo(1, 16, 33), NOW)).toBe('26 авг. в 16:33');
    expect(formatAttachmentDateTime(isoDaysAgo(20, 9, 0), NOW)).toBe('7 авг. в 09:00');
  });

  it('прошлый год и раньше — дата с годом', () => {
    const lastYear = new Date(2025, 7, 15, 16, 33, 0).toISOString();
    const result = formatAttachmentDateTime(lastYear, NOW);
    expect(result).toContain('2025');
    expect(result).toContain('15 авг.');
    expect(result).toContain('16:33');
  });
});
