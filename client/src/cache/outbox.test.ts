import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache, type OutboxEntry } from './db';
import { bumpAttempts, dequeueOutbox, enqueueOutbox, nextRetryDelayMs, outboxAttachmentToFile, readOutbox } from './outbox';

function entry(clientId: string, createdAt: number): OutboxEntry {
  return {
    clientId,
    chatId: 'c1',
    content: `текст ${clientId}`,
    replyToId: null,
    attachment: null,
    createdAt,
    attempts: 0,
  };
}

describe('outbox', () => {
  beforeEach(async () => {
    await clearAllCache();
  });

  it('отдаёт записи в порядке добавления', async () => {
    await enqueueOutbox(entry('b', 200));
    await enqueueOutbox(entry('a', 100));

    expect((await readOutbox()).map((item) => item.clientId)).toEqual(['a', 'b']);
  });

  it('удаляет запись по clientId', async () => {
    await enqueueOutbox(entry('a', 100));

    await dequeueOutbox('a');

    expect(await readOutbox()).toEqual([]);
  });

  it('считает попытки', async () => {
    await enqueueOutbox(entry('a', 100));

    expect(await bumpAttempts('a')).toBe(1);
    expect(await bumpAttempts('a')).toBe(2);
  });

  it('наращивает паузу между повторами и упирается в потолок', () => {
    expect(nextRetryDelayMs(1)).toBeLessThan(nextRetryDelayMs(3));
    expect(nextRetryDelayMs(99)).toBe(nextRetryDelayMs(100));
  });

  it('восстанавливает File из записи очереди', () => {
    const file = outboxAttachmentToFile({
      blob: new Blob(['данные']),
      fileName: 'voice.webm',
      mimeType: 'audio/webm',
      duration: 1200,
      peaks: [1, 2, 3],
    });

    expect(file.name).toBe('voice.webm');
    expect(file.type).toBe('audio/webm');
    expect(file.size).toBeGreaterThan(0);
  });
});
