import { describe, expect, it } from 'vitest';

import { tokenizeComposerValue } from './composerContent';

describe('tokenizeComposerValue', () => {
  it('возвращает пустой массив для пустой строки', () => {
    expect(tokenizeComposerValue('')).toEqual([]);
  });

  it('строку без эмодзи возвращает одним текстовым токеном', () => {
    expect(tokenizeComposerValue('привет')).toEqual([{ kind: 'text', text: 'привет' }]);
  });

  it('одиночный эмодзи возвращает одним эмодзи-токеном', () => {
    expect(tokenizeComposerValue('😀')).toEqual([{ kind: 'emoji', emoji: '😀' }]);
  });

  it('эмодзи между текстом разбивает на три токена', () => {
    expect(tokenizeComposerValue('до😀после')).toEqual([
      { kind: 'text', text: 'до' },
      { kind: 'emoji', emoji: '😀' },
      { kind: 'text', text: 'после' },
    ]);
  });

  it('подряд идущие эмодзи не склеиваются в один токен', () => {
    expect(tokenizeComposerValue('😀😁')).toEqual([
      { kind: 'emoji', emoji: '😀' },
      { kind: 'emoji', emoji: '😁' },
    ]);
  });

  it('эмодзи в начале и в конце строки', () => {
    expect(tokenizeComposerValue('😀текст😁')).toEqual([
      { kind: 'emoji', emoji: '😀' },
      { kind: 'text', text: 'текст' },
      { kind: 'emoji', emoji: '😁' },
    ]);
  });
});
