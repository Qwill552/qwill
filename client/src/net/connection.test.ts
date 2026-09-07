import { describe, expect, it } from 'vitest';

import { classifyConnection } from './connection';

describe('classifyConnection', () => {
  it('без Network Information API считает сеть неизвестной', () => {
    expect(classifyConnection(undefined)).toBe('unknown');
  });

  it('type: cellular — мобильная сеть', () => {
    expect(classifyConnection({ type: 'cellular' })).toBe('cellular');
  });

  it('type: wifi — Wi-Fi', () => {
    expect(classifyConnection({ type: 'wifi' })).toBe('wifi');
  });

  it('type: ethernet — тоже не мобильная сеть', () => {
    expect(classifyConnection({ type: 'ethernet' })).toBe('wifi');
  });

  it('type: none — не мобильная сеть по одному type', () => {
    expect(classifyConnection({ type: 'none' })).toBe('unknown');
  });

  it('без type, но с медленным effectiveType — мобильная сеть', () => {
    expect(classifyConnection({ effectiveType: '3g' })).toBe('cellular');
    expect(classifyConnection({ effectiveType: '2g' })).toBe('cellular');
  });

  it('без type, но с быстрым effectiveType — Wi-Fi', () => {
    expect(classifyConnection({ effectiveType: '4g' })).toBe('wifi');
  });

  it('ни type, ни effectiveType — неизвестна', () => {
    expect(classifyConnection({ saveData: false })).toBe('unknown');
  });
});
