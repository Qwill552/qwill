import type { MessageDto } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { mergeSyncedMessages } from './syncEngine';

function message(id: number, content: string, deletedAt: string | null = null): MessageDto {
  return {
    id,
    chatId: 'c1',
    clientId: null,
    albumId: null,
    sender: null,
    type: 'TEXT',
    content,
    attachment: null,
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    announcement: null,
    reactions: [],
    editedAt: null,
    deletedAt,
    createdAt: new Date(Math.abs(id) * 1000).toISOString(),
  } as MessageDto;
}

describe('mergeSyncedMessages', () => {
  it('дописывает новые сообщения в конец', () => {
    const merged = mergeSyncedMessages([message(1, 'первое')], [message(2, 'второе')], []);

    expect(merged.map((m) => m.id)).toEqual([1, 2]);
  });

  it('заменяет отредактированное сообщение на месте', () => {
    const merged = mergeSyncedMessages([message(1, 'старое'), message(2, 'второе')], [], [message(1, 'новое')]);

    expect(merged.map((m) => m.content)).toEqual(['новое', 'второе']);
  });

  it('выбрасывает удалённое сообщение из ленты', () => {
    const merged = mergeSyncedMessages([message(1, 'а'), message(2, 'б')], [], [message(1, null as never, '2026-08-08T00:00:00.000Z')]);

    expect(merged.map((m) => m.id)).toEqual([2]);
  });

  it('держит оптимистичные сообщения в хвосте ленты', () => {
    const merged = mergeSyncedMessages([message(-1, 'отправляется')], [message(4, 'пришло')], []);

    expect(merged.map((m) => m.id)).toEqual([4, -1]);
  });

  it('не переставляет оптимистичные сообщения между собой', () => {
    const older = { ...message(-2, 'первое'), createdAt: '2026-08-25T10:00:00.000Z' };
    const newer = { ...message(-1, 'второе'), createdAt: '2026-08-25T10:00:01.000Z' };

    const merged = mergeSyncedMessages([older, newer], [message(4, 'пришло')], []);

    expect(merged.map((m) => m.content)).toEqual(['пришло', 'первое', 'второе']);
  });

  it('обновляет уже известное сообщение, даже если оно пришло в created', () => {
    const merged = mergeSyncedMessages([message(1, 'старое'), message(2, 'второе')], [message(1, 'новое')], []);

    expect(merged.map((m) => m.content)).toEqual(['новое', 'второе']);
  });
});
