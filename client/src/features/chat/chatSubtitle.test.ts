import type { ChatMemberSummary } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { chatSubtitle, groupTyping, membersText, type SubtitleInput } from './chatSubtitle';
import { plural } from './plural';

const ME = 'me';

function member(id: string, displayName = id): ChatMemberSummary {
  return { id, username: id, displayName, avatarUrl: null, avatarColor: 'violet', lastSeenAt: '2026-09-28T10:00:00.000Z', isService: false };
}

function input(overrides: Partial<SubtitleInput> = {}): SubtitleInput {
  return {
    connection: 'brand',
    service: false,
    group: false,
    memberIds: null,
    myId: ME,
    typists: [],
    otherMember: member('peer'),
    presence: () => undefined,
    ...overrides,
  };
}

describe('chatSubtitle', () => {
  it('показывает состояние соединения поверх всего остального', () => {
    const result = chatSubtitle(input({ connection: 'waiting', typists: [{ userId: 'peer', displayName: 'Пётр' }] }));
    expect(result).toEqual({ text: 'Ожидание сети', tone: 'default', typing: false, dots: true });
    expect(chatSubtitle(input({ connection: 'connecting', service: true }))?.text).toBe('Соединение');
    expect(chatSubtitle(input({ connection: 'ipBanned' }))?.dots).toBe(false);
  });

  it('у сервисного чата подзаголовка нет', () => {
    expect(chatSubtitle(input({ service: true }))).toBeNull();
  });

  it('в личке пишет «печатает…» акцентом и не считает себя', () => {
    expect(chatSubtitle(input({ typists: [{ userId: 'peer', displayName: 'Пётр' }] }))).toEqual({
      text: 'печатает…',
      tone: 'accent',
      typing: true,
      dots: false,
    });
    expect(chatSubtitle(input({ typists: [{ userId: ME, displayName: 'Я' }] }))?.typing).toBe(false);
  });

  it('в группе даёт три формы «печатает» по первому слову имени', () => {
    expect(groupTyping([{ userId: 'a', displayName: 'Иван Петров' }])).toBe('Иван печатает…');
    expect(
      groupTyping([
        { userId: 'a', displayName: 'Иван Петров' },
        { userId: 'b', displayName: '  Мария ' },
      ]),
    ).toBe('Иван, Мария печатают…');
    expect(
      groupTyping([
        { userId: 'a', displayName: 'Иван' },
        { userId: 'b', displayName: 'Мария' },
        { userId: 'c', displayName: 'Олег' },
        { userId: 'd', displayName: 'Анна' },
      ]),
    ).toBe('Иван, Мария и ещё 2 печатают…');
  });

  it('пишет число участников группы по всем трём формам', () => {
    expect(membersText(1)).toBe('1 участник');
    expect(membersText(2)).toBe('2 участника');
    expect(membersText(5)).toBe('5 участников');
    expect(membersText(11)).toBe('11 участников');
    expect(membersText(21)).toBe('21 участник');
    expect(membersText(22)).toBe('22 участника');
    expect(membersText(112)).toBe('112 участников');
  });

  it('добавляет «в сети» только когда в сети есть кто-то кроме меня', () => {
    const memberIds = [ME, 'a', 'b'];
    const alone = chatSubtitle(input({ group: true, memberIds, presence: (id) => (id === ME ? { online: true, lastSeenAt: '' } : undefined) }));
    expect(alone?.text).toBe('3 участника');
    const together = chatSubtitle(
      input({ group: true, memberIds, presence: (id) => (id === 'a' ? { online: true, lastSeenAt: '' } : undefined) }),
    );
    expect(together?.text).toBe('3 участника, 2 в сети');
  });

  it('до прихода участников у группы подзаголовка нет', () => {
    expect(chatSubtitle(input({ group: true, memberIds: null }))).toBeNull();
  });

  it('в личке «в сети» тоном online, иначе «был(а) …»', () => {
    expect(chatSubtitle(input({ presence: () => ({ online: true, lastSeenAt: '' }) }))).toEqual({
      text: 'в сети',
      tone: 'online',
      typing: false,
      dots: false,
    });
    expect(chatSubtitle(input())?.text.startsWith('был(а) ')).toBe(true);
  });
});

describe('plural', () => {
  it.each([
    [0, 'many'],
    [1, 'one'],
    [2, 'few'],
    [4, 'few'],
    [5, 'many'],
    [11, 'many'],
    [12, 'many'],
    [14, 'many'],
    [21, 'one'],
    [22, 'few'],
    [25, 'many'],
    [101, 'one'],
    [111, 'many'],
  ])('%i → %s', (count, form) => {
    expect(plural(count, 'one', 'few', 'many')).toBe(form);
  });
});
