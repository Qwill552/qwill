import type { AttachmentDto, ChatMemberSummary } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import type { LocalMessage } from '../../stores/chatStore';
import { groupAlbums } from './albums';

const START = Date.parse('2026-08-23T10:00:00.000Z');

function photo(id: string): AttachmentDto {
  return {
    id,
    file: { id: `file-${id}`, mimeType: 'image/jpeg', size: 1000, url: '' },
    thumbnail: null,
    originalName: `${id}.jpg`,
    width: 1200,
    height: 800,
    duration: null,
    peaks: null,
  };
}

function message(id: number, patch: Partial<LocalMessage> = {}): LocalMessage {
  return {
    id,
    chatId: 'chat',
    clientId: null,
    sender: { id: 'me', username: 'me', displayName: 'Я', avatarUrl: null, avatarColor: 'blue', lastSeenAt: '', isService: false },
    type: 'TEXT',
    content: null,
    attachment: photo(`a${id}`),
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    announcement: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(START + id * 1000).toISOString(),
    ...patch,
  };
}

function shape(messages: LocalMessage[]): number[] {
  return groupAlbums(messages).map((group) => group.length);
}

describe('groupAlbums', () => {
  it('соседние фото одного автора собирает в один альбом', () => {
    expect(shape([message(1), message(2), message(3)])).toEqual([3]);
  });

  it('текстовое сообщение между фото разрывает альбом', () => {
    expect(shape([message(1), message(2, { attachment: null, content: 'привет' }), message(3)])).toEqual([1, 1, 1]);
  });

  it('подпись у первого фото альбом не разрывает, у следующего — разрывает', () => {
    expect(shape([message(1, { content: 'подпись' }), message(2)])).toEqual([2]);
    expect(shape([message(1), message(2, { content: 'подпись' })])).toEqual([1, 1]);
  });

  it('разные авторы в один альбом не попадают', () => {
    const other: ChatMemberSummary = {
      id: 'other',
      username: 'o',
      displayName: 'О',
      avatarUrl: null,
      avatarColor: 'violet',
      lastSeenAt: '',
      isService: false,
    };
    expect(shape([message(1), message(2, { sender: other })])).toEqual([1, 1]);
  });

  it('разрыв больше минуты начинает новый альбом', () => {
    const late = message(2, { createdAt: new Date(START + 120 * 1000).toISOString() });
    expect(shape([message(1), late])).toEqual([1, 1]);
  });

  it('фото с реакцией стоит отдельным пузырём', () => {
    const reacted = message(2, { reactions: [{ emoji: '❤️', userIds: ['me'] }] });
    expect(shape([message(1), reacted, message(3)])).toEqual([1, 1, 1]);
  });

  it('в альбом попадает не больше десяти фото', () => {
    expect(shape(Array.from({ length: 13 }, (_, index) => message(index + 1)))).toEqual([10, 3]);
  });

  it('неотправленное сообщение и файл в альбом не идут', () => {
    const file = message(2, {
      attachment: { ...photo('a2'), file: { id: 'f', mimeType: 'application/pdf', size: 10, url: '' } },
    });
    expect(shape([message(1), file, message(3)])).toEqual([1, 1, 1]);
    expect(shape([message(1), message(-2)])).toEqual([1, 1]);
  });
});
