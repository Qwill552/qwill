import { describe, expect, it } from 'vitest';

import { extractLinks, splitTextWithLinks } from '../src/text.js';

describe('splitTextWithLinks', () => {
  it('находит одну ссылку среди текста', () => {
    expect(splitTextWithLinks('смотри https://example.com там')).toEqual([
      { kind: 'text', value: 'смотри ', href: null },
      { kind: 'link', value: 'https://example.com', href: 'https://example.com' },
      { kind: 'text', value: ' там', href: null },
    ]);
  });

  it('находит несколько ссылок подряд', () => {
    expect(splitTextWithLinks('https://a.com https://b.com')).toEqual([
      { kind: 'link', value: 'https://a.com', href: 'https://a.com' },
      { kind: 'text', value: ' ', href: null },
      { kind: 'link', value: 'https://b.com', href: 'https://b.com' },
    ]);
  });

  it('распознаёт ссылку в начале строки', () => {
    expect(splitTextWithLinks('https://example.com текст')).toEqual([
      { kind: 'link', value: 'https://example.com', href: 'https://example.com' },
      { kind: 'text', value: ' текст', href: null },
    ]);
  });

  it('распознаёт ссылку в конце строки', () => {
    expect(splitTextWithLinks('текст https://example.com')).toEqual([
      { kind: 'text', value: 'текст ', href: null },
      { kind: 'link', value: 'https://example.com', href: 'https://example.com' },
    ]);
  });

  it('не съедает точку после ссылки', () => {
    expect(splitTextWithLinks('см. https://example.com.')).toEqual([
      { kind: 'text', value: 'см. ', href: null },
      { kind: 'link', value: 'https://example.com', href: 'https://example.com' },
      { kind: 'text', value: '.', href: null },
    ]);
  });

  it('не съедает закрывающую скобку после ссылки', () => {
    expect(splitTextWithLinks('(см. https://example.com)')).toEqual([
      { kind: 'text', value: '(см. ', href: null },
      { kind: 'link', value: 'https://example.com', href: 'https://example.com' },
      { kind: 'text', value: ')', href: null },
    ]);
  });

  it('сохраняет парные скобки внутри пути', () => {
    const url = 'https://en.wikipedia.org/wiki/Bracket_(disambiguation)';
    expect(splitTextWithLinks(url)).toEqual([{ kind: 'link', value: url, href: url }]);
  });

  it('не распознаёт javascript: как ссылку', () => {
    expect(splitTextWithLinks('javascript:alert(1)')).toEqual([
      { kind: 'text', value: 'javascript:alert(1)', href: null },
    ]);
  });

  it('не распознаёт data: как ссылку', () => {
    expect(splitTextWithLinks('data:text/html,<script>alert(1)</script>')).toEqual([
      { kind: 'text', value: 'data:text/html,<script>alert(1)</script>', href: null },
    ]);
  });

  it('возвращает текст без ссылок одним спаном', () => {
    expect(splitTextWithLinks('обычное сообщение без ссылок')).toEqual([
      { kind: 'text', value: 'обычное сообщение без ссылок', href: null },
    ]);
  });

  it('не роняет функцию на пустой строке', () => {
    expect(splitTextWithLinks('')).toEqual([{ kind: 'text', value: '', href: null }]);
  });

  it('не роняет функцию на null-подобных значениях', () => {
    expect(splitTextWithLinks(null as unknown as string)).toEqual([{ kind: 'text', value: '', href: null }]);
    expect(splitTextWithLinks(undefined as unknown as string)).toEqual([{ kind: 'text', value: '', href: null }]);
  });

  it('не рвёт разбор на юникоде в пути и в домене', () => {
    const url = 'https://пример.рф/страница';
    expect(splitTextWithLinks(`ссылка ${url} тут`)).toEqual([
      { kind: 'text', value: 'ссылка ', href: null },
      { kind: 'link', value: url, href: url },
      { kind: 'text', value: ' тут', href: null },
    ]);
  });

  it('не считает голый домен без схемы ссылкой', () => {
    expect(splitTextWithLinks('это example.com/path не ссылка')).toEqual([
      { kind: 'text', value: 'это example.com/path не ссылка', href: null },
    ]);
  });
});

describe('extractLinks', () => {
  it('возвращает только href найденных ссылок', () => {
    expect(extractLinks('первая https://a.com, вторая https://b.com!')).toEqual(['https://a.com', 'https://b.com']);
  });

  it('возвращает пустой список без ссылок', () => {
    expect(extractLinks('просто текст')).toEqual([]);
  });
});
