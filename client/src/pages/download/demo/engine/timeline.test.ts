import { describe, expect, it } from 'vitest';

import { scenarioDuration, targetAt, type Scenario } from './timeline';

const SCENARIO: Scenario = {
  id: 'test',
  scenes: [
    { durationMs: 1000, ease: 'linear', set: { screen: 'chats', chatsScroll: 0 } },
    { durationMs: 2000, ease: 'linear', set: { chatsScroll: 200 } },
    { durationMs: 1000, ease: 'linear', set: { screen: 'chat', feedScroll: 0 } },
    { durationMs: 1000, ease: 'linear', set: { screen: 'chats', chatsScroll: 0 } },
  ],
};

describe('targetAt', () => {
  it('длительность сценария — сумма сцен', () => {
    expect(scenarioDuration(SCENARIO)).toBe(5000);
  });

  it('непрерывный канал едет от значения предыдущей сцены к своему', () => {
    expect(targetAt(SCENARIO, 1000).chatsScroll).toBeCloseTo(0);
    expect(targetAt(SCENARIO, 2000).chatsScroll).toBeCloseTo(100);
    expect(targetAt(SCENARIO, 2999).chatsScroll).toBeCloseTo(199.9, 1);
  });

  it('дискретный канал переключается на границе сцены, а не плавно', () => {
    expect(targetAt(SCENARIO, 2999).screen).toBe('chats');
    expect(targetAt(SCENARIO, 3000).screen).toBe('chat');
    expect(targetAt(SCENARIO, 3999).screen).toBe('chat');
    expect(targetAt(SCENARIO, 4000).screen).toBe('chats');
  });

  it('зациклен: t и t плюс круг дают одно и то же', () => {
    for (const timeMs of [0, 700, 2500, 3300, 4900]) {
      expect(targetAt(SCENARIO, timeMs)).toEqual(targetAt(SCENARIO, timeMs + 5000));
      expect(targetAt(SCENARIO, timeMs)).toEqual(targetAt(SCENARIO, timeMs + 50000));
    }
  });

  it('шов круга без разрыва: конец последней сцены равен началу первой', () => {
    const beforeSeam = targetAt(SCENARIO, 4999).chatsScroll;
    const afterSeam = targetAt(SCENARIO, 0).chatsScroll;
    expect(Math.abs(beforeSeam - afterSeam)).toBeLessThan(0.25);
  });

  it('отрицательное время не ломает круг', () => {
    expect(targetAt(SCENARIO, -1000)).toEqual(targetAt(SCENARIO, 4000));
    expect(targetAt(SCENARIO, -5500)).toEqual(targetAt(SCENARIO, 4500));
  });

  it('пустой сценарий отдаёт покой', () => {
    const empty: Scenario = { id: 'empty', scenes: [] };
    expect(targetAt(empty, 1234).screen).toBe('chats');
    expect(targetAt(empty, 1234).chatsScroll).toBe(0);
  });

  it('движение в пределах сцены монотонно', () => {
    let previous = -1;
    for (let timeMs = 1000; timeMs <= 3000; timeMs += 50) {
      const value = targetAt(SCENARIO, timeMs).chatsScroll;
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('канал, которого сцена не касается, держит прежнее значение', () => {
    expect(targetAt(SCENARIO, 1500).feedScroll).toBe(0);
    expect(targetAt(SCENARIO, 3500).chatsScroll).toBeCloseTo(200);
  });
});
