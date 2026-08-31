import { afterEach, describe, expect, it, vi } from 'vitest';

import { cssDurationMs } from './motion';

function declare(value: string): void {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: () => value,
  } as unknown as CSSStyleDeclaration);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cssDurationMs: единица измерения токена', () => {
  it('читает миллисекунды, как они записаны в исходнике', () => {
    declare('700ms');

    expect(cssDurationMs('--dur-dissolve')).toBe(700);
  });

  it('читает секунды, в которые Lightning CSS переписывает токен при сборке', () => {
    declare('.7s');

    expect(cssDurationMs('--dur-dissolve')).toBe(700);
  });

  it('секунды без ведущего нуля и целые секунды тоже в миллисекундах', () => {
    declare('1s');
    expect(cssDurationMs('--dur-pulse')).toBe(1000);

    declare('.28s');
    expect(cssDurationMs('--dur-screen')).toBe(280);
  });

  it('схлопнутый prefers-reduced-motion остаётся единицей', () => {
    declare('1ms');

    expect(cssDurationMs('--dur-dissolve')).toBe(1);
  });

  it('незаданный токен — ноль, а не NaN', () => {
    declare('');

    expect(cssDurationMs('--dur-missing')).toBe(0);
  });
});
