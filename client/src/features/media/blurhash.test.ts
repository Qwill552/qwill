import { describe, expect, it } from 'vitest';

import { BLURHASH_CANVAS_SIDE, decodeBlurhashPixels } from './useMediaSrc';

const VALID = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';

describe('decodeBlurhashPixels (КЭШ-12)', () => {
  it('валидная строка превращается в пиксели 32×32', () => {
    const pixels = decodeBlurhashPixels(VALID);
    expect(pixels).not.toBeNull();
    expect(pixels?.length).toBe(BLURHASH_CANVAS_SIDE * BLURHASH_CANVAS_SIDE * 4);
  });

  it('мусор, пустота и null отдают null, а не исключение', () => {
    expect(decodeBlurhashPixels(null)).toBeNull();
    expect(decodeBlurhashPixels(undefined)).toBeNull();
    expect(decodeBlurhashPixels('')).toBeNull();
    expect(decodeBlurhashPixels('«русские буквы»')).toBeNull();
    expect(decodeBlurhashPixels('LEHV')).toBeNull();
    expect(decodeBlurhashPixels('L'.repeat(200))).toBeNull();
    expect(decodeBlurhashPixels('LEHV6nWB2yk8pyo0adR*.7kCMdn')).toBeNull();
  });
});
