import type { GroupMemberDTO } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { captionName, filterMembers } from './memberSuggest';

function member(userId: string, username: string, displayName: string): GroupMemberDTO {
  return { userId, username, displayName, avatarUrl: null, avatarColor: 'blue', role: 'MEMBER', joinedAt: '2026-09-01T00:00:00.000Z' };
}

const anna = member('a', 'anna_p', 'Анна Петрова');
const boris = member('b', 'boris', 'Борис');
const hedgehog = member('c', 'hedgehog', 'Ёжик Туманный');
const me = member('me', 'me', 'Я Сам');
const all = [anna, boris, hedgehog, me];

describe('filterMembers: «От кого» в поиске по чату', () => {
  it('себя в списке нет', () => {
    expect(filterMembers(all, '', [], 'me').map((m) => m.userId)).not.toContain('me');
  });

  it('сначала недавние авторы, от нового к старому, потом остальные по порядку участников', () => {
    expect(filterMembers(all, '', ['c', 'b', 'c'], 'me').map((m) => m.userId)).toEqual(['c', 'b', 'a']);
  });

  it('совпадение — начало ника, любого слова имени или всего имени', () => {
    expect(filterMembers(all, 'петр', [], 'me').map((m) => m.userId)).toEqual(['a']);
    expect(filterMembers(all, 'етров', [], 'me')).toEqual([]);
    expect(filterMembers(all, 'anna', [], 'me').map((m) => m.userId)).toEqual(['a']);
    expect(filterMembers(all, '@bor', [], 'me').map((m) => m.userId)).toEqual(['b']);
    expect(filterMembers(all, 'анна п', [], 'me').map((m) => m.userId)).toEqual(['a']);
    expect(filterMembers(all, 'туман', [], 'me').map((m) => m.userId)).toEqual(['c']);
  });

  it('ё = е, регистр не важен', () => {
    expect(filterMembers(all, 'ЕЖИК', [], 'me').map((m) => m.userId)).toEqual(['c']);
  });

  it('пустой запрос — все, кроме себя; участники не пришли — пусто', () => {
    expect(filterMembers(all, '  ', [], 'me')).toHaveLength(3);
    expect(filterMembers(undefined, '', [], 'me')).toEqual([]);
  });
});

describe('captionName: подпись «От: Имя»', () => {
  it('первое слово имени, не длиннее 10 знаков', () => {
    expect(captionName(anna)).toBe('Анна');
    expect(captionName(member('x', 'k', 'Константинопольский'))).toBe('Константин');
    expect(captionName(member('x', 'anna', ''))).toBe('anna');
  });
});
