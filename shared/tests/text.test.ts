import { describe, expect, it } from 'vitest';

import { extractLinks, findMentions, splitTextWithLinks } from '../src/text.js';

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

describe('findMentions', () => {
  const names = (content: string) => findMentions(content).map((mention) => mention.username);

  it('находит упоминание в начале строки и отдаёт границы', () => {
    expect(findMentions('@alice привет')).toEqual([{ start: 0, end: 6, username: 'alice' }]);
  });

  it('находит упоминание после пробела, перевода строки и скобки', () => {
    expect(names('привет @bob')).toEqual(['bob']);
    expect(names('строка\n@bob')).toEqual(['bob']);
    expect(names('(@bob)')).toEqual(['bob']);
    expect(names('«@bob»')).toEqual(['bob']);
    expect(names('да,@bob')).toEqual(['bob']);
  });

  it('не считает почту упоминанием', () => {
    expect(names('пиши на a@bob.com')).toEqual([]);
  });

  it('не считает двойную собаку упоминанием', () => {
    expect(names('@@bob')).toEqual([]);
  });

  it('не ищет упоминания внутри ссылки', () => {
    expect(names('https://example.com/@bob')).toEqual([]);
    expect(names('https://example.com/ @bob')).toEqual(['bob']);
  });

  it('держит длину ника от 3 до 32 знаков', () => {
    expect(names('@ab')).toEqual([]);
    expect(names(`@${'a'.repeat(32)}`)).toEqual(['a'.repeat(32)]);
    expect(names(`@${'a'.repeat(33)}`)).toEqual([]);
  });

  it('сводит регистр к нижнему', () => {
    expect(names('@Alice_01')).toEqual(['alice_01']);
  });

  it('не считает кириллицу после собаки ником', () => {
    expect(names('@алиса')).toEqual([]);
    expect(names('@bobик')).toEqual(['bob']);
  });

  it('отпускает точку, запятую и вопрос после ника', () => {
    expect(names('это @bob.')).toEqual(['bob']);
    expect(names('@bob, привет')).toEqual(['bob']);
    expect(names('ты где, @bob?')).toEqual(['bob']);
  });

  it('находит несколько упоминаний подряд', () => {
    expect(names('@bob @carol')).toEqual(['bob', 'carol']);
  });

  it('пустой текст — пусто', () => {
    expect(findMentions('')).toEqual([]);
  });
});
