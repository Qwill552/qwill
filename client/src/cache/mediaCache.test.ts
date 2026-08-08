import { describe, expect, it } from 'vitest';

import { selectEvictionVictims, type EvictionCandidate } from './mediaCache';

function candidate(fileId: string, size: number, lastUsedAt: number, tier: 'thumb' | 'full'): EvictionCandidate {
  return { fileId, size, lastUsedAt, tier };
}

describe('selectEvictionVictims', () => {
  it('не трогает ничего, пока бюджет не превышен', () => {
    const victims = selectEvictionVictims([candidate('a', 40, 1, 'full')], 100);

    expect(victims).toEqual([]);
  });

  it('вытесняет самое давнее до 75% бюджета', () => {
    const victims = selectEvictionVictims(
      [candidate('old', 50, 1, 'full'), candidate('mid', 50, 2, 'full'), candidate('new', 50, 3, 'full')],
      100,
    );

    expect(victims).toEqual(['old', 'mid']);
  });

  it('превью вытесняет только после того, как кончились полные файлы', () => {
    const victims = selectEvictionVictims(
      [candidate('thumb-old', 60, 1, 'thumb'), candidate('full-new', 60, 9, 'full')],
      100,
    );

    expect(victims).toEqual(['full-new']);
  });
});
