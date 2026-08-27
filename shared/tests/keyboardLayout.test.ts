import { describe, expect, it } from 'vitest';

import { layoutVariants } from '../src/keyboardLayout.js';

describe('layoutVariants', () => {
  it('returns the original query first', () => {
    expect(layoutVariants('привет')[0]).toBe('привет');
  });

  it('converts qwerty typed text to jcuken', () => {
    expect(layoutVariants('ghbdtn')).toEqual(['ghbdtn', 'привет']);
  });

  it('converts jcuken typed text to qwerty', () => {
    expect(layoutVariants('руддщ')).toEqual(['руддщ', 'hello']);
  });

  it('converts a username typed in the wrong layout', () => {
    expect(layoutVariants('gbljh')).toContain('пидор');
  });

  it('converts an emoji keyword typed in the wrong layout', () => {
    expect(layoutVariants('jujym')).toContain('огонь');
  });

  it('is case-insensitive and works on the lowercased form', () => {
    expect(layoutVariants('GHBDTN')).toEqual(['ghbdtn', 'привет']);
  });

  it('converts punctuation produced by the wrong layout', () => {
    expect(layoutVariants('a@a')).toContain('ф"ф');
    expect(layoutVariants('ф"ф')).toContain('a@a');
  });

  it('leaves digit-only queries alone after deduplication', () => {
    expect(layoutVariants('12345')).toEqual(['12345']);
  });

  it('produces exactly one alternate reading for a plain latin word', () => {
    expect(layoutVariants('hello')).toEqual(['hello', 'руддщ']);
  });

  it('does not convert mixed-alphabet input', () => {
    expect(layoutVariants('абвgh')).toEqual(['абвgh']);
  });

  it('returns a single empty variant for an empty string', () => {
    expect(layoutVariants('')).toEqual(['']);
  });

  it('round-trips ё between layouts', () => {
    expect(layoutVariants('ё')).toEqual(['ё', '`']);
    expect(layoutVariants('`')).toEqual(['`', 'ё']);
  });

  it('never returns more than two variants', () => {
    expect(layoutVariants('ghbdtn').length).toBeLessThanOrEqual(2);
    expect(layoutVariants('12345').length).toBeLessThanOrEqual(2);
  });
});
