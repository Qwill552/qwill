import { describe, expect, it } from 'vitest';

import { formatChatRowWhen } from '../messages/dayLabel';
import { msUntilNextDay, startOfToday } from './useToday';

describe('msUntilNextDay', () => {
  it('за две минуты до полуночи ждёт две минуты с небольшим запасом', () => {
    const wait = msUntilNextDay(new Date(2026, 8, 25, 23, 58, 0));
    expect(wait).toBeGreaterThan(120_000);
    expect(wait).toBeLessThan(121_000);
  });

  it('после ожидания наступают следующие сутки', () => {
    const now = new Date(2026, 11, 31, 23, 58, 0);
    const later = new Date(now.getTime() + msUntilNextDay(now));
    expect(startOfToday(later).getTime()).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe('строка списка после полуночи', () => {
  it('«23:58» вчерашнего дня становится «вчера», когда наступают новые сутки', () => {
    const sentAt = new Date(2026, 8, 25, 23, 58, 0);
    const beforeMidnight = startOfToday(sentAt);
    const afterMidnight = startOfToday(new Date(sentAt.getTime() + msUntilNextDay(sentAt)));

    expect(formatChatRowWhen(sentAt.toISOString(), beforeMidnight)).toBe('23:58');
    expect(formatChatRowWhen(sentAt.toISOString(), afterMidnight)).toBe('вчера');
  });
});
