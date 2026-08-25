import type { MessageDto } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { isDeletableMessage, isDeletableSelection } from './messageDeleting';

const ME = 'me';
const OTHER = 'other';

function message(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 1,
    chatId: 'chat-1',
    clientId: null,
    albumId: null,
    sender: { id: ME, username: 'me', displayName: 'Я', avatarUrl: null, avatarColor: 'violet', lastSeenAt: '', isService: false },
    type: 'TEXT',
    content: 'привет',
    attachment: null,
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    announcement: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(2026, 0, 1).toISOString(),
    ...overrides,
  };
}

function foreign(overrides: Partial<MessageDto> = {}): MessageDto {
  const own = message(overrides);
  return { ...own, sender: { ...own.sender!, id: OTHER, username: 'other', displayName: 'Он' } };
}

describe('удаление сообщения: кому что можно', () => {
  it('своё сообщение удалить можно', () => {
    expect(isDeletableMessage(message(), ME, false)).toBe(true);
  });

  it('чужое сообщение в приватном чате удалить нельзя', () => {
    expect(isDeletableMessage(foreign(), ME, false)).toBe(false);
  });

  it('чужое сообщение админ группы удалить может', () => {
    expect(isDeletableMessage(foreign(), ME, true)).toBe(true);
  });

  it('ещё не отправленное и уже удалённое не удаляются', () => {
    expect(isDeletableMessage(message({ id: -17 }), ME, false)).toBe(false);
    expect(isDeletableMessage(message({ deletedAt: new Date().toISOString() }), ME, false)).toBe(false);
  });

  it('мультивыбор: одно чужое сообщение отменяет удаление всей пачки', () => {
    expect(isDeletableSelection([message({ id: 1 }), message({ id: 2 })], ME, false)).toBe(true);
    expect(isDeletableSelection([message({ id: 1 }), foreign({ id: 2 })], ME, false)).toBe(false);
    expect(isDeletableSelection([message({ id: 1 }), foreign({ id: 2 })], ME, true)).toBe(true);
  });

  it('пустой выбор удалять нечего', () => {
    expect(isDeletableSelection([], ME, true)).toBe(false);
  });
});
