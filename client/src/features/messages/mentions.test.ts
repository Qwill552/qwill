import type { ChatMemberSummary } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { findMentionQuery, mentionInsertion, mentionsMe } from './mentions';

const peer = { id: 'u2' } as ChatMemberSummary;
const me = { id: 'u1' } as ChatMemberSummary;

describe('findMentionQuery', () => {
  it('собака в начале текста', () => {
    expect(findMentionQuery('@ива', 4, 4)).toEqual({ start: 0, end: 4, query: 'ива' });
  });

  it('после пробела и перевода строки', () => {
    expect(findMentionQuery('привет @bo', 10, 10)?.query).toBe('bo');
    expect(findMentionQuery('строка\n@', 8, 8)?.query).toBe('');
  });

  it('внутри слова — нет', () => {
    expect(findMentionQuery('a@b', 3, 3)).toBeNull();
  });

  it('запрос может содержать пробел, но не кончаться им', () => {
    expect(findMentionQuery('@Иван П', 7, 7)?.query).toBe('Иван П');
    expect(findMentionQuery('@bob ', 5, 5)).toBeNull();
  });

  it('выделение и курсор до собаки — нет', () => {
    expect(findMentionQuery('@bob', 1, 4)).toBeNull();
    expect(findMentionQuery('@bob', 0, 0)).toBeNull();
  });

  it('перевод строки обрывает поиск', () => {
    expect(findMentionQuery('@bo\nb', 5, 5)).toBeNull();
  });

  it('вставка — ник и пробел', () => {
    expect(mentionInsertion('bob')).toBe('@bob ');
  });
});

describe('mentionsMe', () => {
  it('мой ник в тексте', () => {
    expect(mentionsMe({ sender: peer, deletedAt: null, content: 'глянь @Alice_1' }, 'GROUP', 'u1', 'alice_1', null)).toBe(true);
  });

  it('ответ на моё', () => {
    expect(mentionsMe({ sender: peer, deletedAt: null, content: 'ответ' }, 'GROUP', 'u1', 'alice', 'u1')).toBe(true);
  });

  it('своё и личный чат — нет', () => {
    expect(mentionsMe({ sender: me, deletedAt: null, content: '@alice' }, 'GROUP', 'u1', 'alice', 'u1')).toBe(false);
    expect(mentionsMe({ sender: peer, deletedAt: null, content: '@alice' }, 'PRIVATE', 'u1', 'alice', 'u1')).toBe(false);
  });

  it('чужой ник и почта — нет', () => {
    expect(mentionsMe({ sender: peer, deletedAt: null, content: '@bobby' }, 'GROUP', 'u1', 'alice', 'u2')).toBe(false);
    expect(mentionsMe({ sender: peer, deletedAt: null, content: 'почта a@alice.ru' }, 'GROUP', 'u1', 'alice', null)).toBe(false);
  });
});
