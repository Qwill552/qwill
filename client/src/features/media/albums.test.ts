import type { AttachmentDto, ChatMemberSummary } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import type { LocalMessage } from '../../stores/chatStore';
import { groupAlbums, mergeReactions } from './albums';

const START = Date.parse('2026-08-23T10:00:00.000Z');

const ME: ChatMemberSummary = {
  id: 'me',
  username: 'me',
  displayName: 'Я',
  avatarUrl: null,
  avatarColor: 'blue',
  lastSeenAt: '',
  isService: false,
};

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
    albumId: 'album',
    sender: ME,
    type: 'MEDIA',
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
  it('фото одной отправки собирает в один альбом', () => {
    expect(shape([message(1), message(2), message(3)])).toEqual([3]);
  });

  it('фото разных отправок не склеивает, даже отправленные подряд', () => {
    expect(shape([message(1, { albumId: 'first' }), message(2, { albumId: 'second' })])).toEqual([1, 1]);
  });

  it('одиночное фото без albumId ни с чем не склеивается', () => {
    expect(shape([message(1, { albumId: null }), message(2, { albumId: null })])).toEqual([1, 1]);
  });

  it('текстовое сообщение между фото разрывает альбом', () => {
    const text = message(2, { attachment: null, content: 'привет', albumId: null, type: 'TEXT' });
    expect(shape([message(1), text, message(3)])).toEqual([1, 1, 1]);
  });

  it('подпись у первого фото альбом не разрывает, у следующего — разрывает', () => {
    expect(shape([message(1, { content: 'подпись' }), message(2)])).toEqual([2]);
    expect(shape([message(1), message(2, { content: 'подпись' })])).toEqual([1, 1]);
  });

  it('гифки в мозаику не склеиваются — ни между собой, ни с фото', () => {
    const gif = (id: number): LocalMessage =>
      message(id, { attachment: { ...photo(`a${id}`), file: { id: `file-a${id}`, mimeType: 'image/gif', size: 1000, url: '' } } });
    expect(shape([gif(1), gif(2)])).toEqual([1, 1]);
    expect(shape([message(1), gif(2), message(3)])).toEqual([1, 1, 1]);
  });

  it('разные авторы в один альбом не попадают', () => {
    const other: ChatMemberSummary = { ...ME, id: 'other', username: 'o', displayName: 'О' };
    expect(shape([message(1), message(2, { sender: other })])).toEqual([1, 1]);
  });

  it('реакция на снимке альбом не разрывает', () => {
    const reacted = message(2, { reactions: [{ emoji: '❤️', userIds: ['me'] }] });
    expect(shape([message(1), reacted, message(3)])).toEqual([3]);
  });

  it('в альбом попадает не больше десяти фото', () => {
    expect(shape(Array.from({ length: 13 }, (_, index) => message(index + 1)))).toEqual([10, 3]);
  });

  it('ещё не отправленное фото уже стоит в альбоме, а файл — нет', () => {
    const uploading = message(2, {
      id: -2,
      attachment: null,
      localAttachment: { kind: 'image', name: 'a.jpg', size: 10, progress: 0.4 },
    });
    expect(shape([message(1), uploading, message(3)])).toEqual([3]);

    const file = message(2, {
      attachment: { ...photo('a2'), file: { id: 'f', mimeType: 'application/pdf', size: 10, url: '' } },
    });
    expect(shape([message(1), file, message(3)])).toEqual([1, 1, 1]);
  });

  it('удалённое сообщение выпадает из альбома', () => {
    expect(shape([message(1), message(2, { deletedAt: new Date().toISOString() }), message(3)])).toEqual([1, 1, 1]);
  });
});

describe('mergeReactions', () => {
  it('одиночному сообщению отдаёт его собственные реакции', () => {
    const single = message(1, { reactions: [{ emoji: '❤️', userIds: ['me'] }] });
    expect(mergeReactions([single])).toEqual([{ emoji: '❤️', userIds: ['me'] }]);
  });

  it('складывает реакции всех снимков альбома без повторов', () => {
    const first = message(1, { reactions: [{ emoji: '❤️', userIds: ['me'] }] });
    const second = message(2, {
      reactions: [
        { emoji: '❤️', userIds: ['other'] },
        { emoji: '🔥', userIds: ['me'] },
      ],
    });
    expect(mergeReactions([first, second])).toEqual([
      { emoji: '❤️', userIds: ['me', 'other'] },
      { emoji: '🔥', userIds: ['me'] },
    ]);
  });
});
