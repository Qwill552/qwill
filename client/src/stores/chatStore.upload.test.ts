import type { MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FilesApi from '../api/files';
import type * as MediaTasks from '../api/mediaTasks';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const socket = { connected: true, emit: vi.fn() };

vi.mock('../realtime/socket', () => ({
  getSocket: vi.fn(() => socket),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  emitWhenReady: vi.fn(),
}));

vi.mock('../api/files', async (importOriginal) => {
  const actual = await importOriginal<typeof FilesApi>();
  return { ...actual, uploadFile: vi.fn() };
});

vi.mock('../api/mediaTasks', async (importOriginal) => {
  const actual = await importOriginal<typeof MediaTasks>();
  return { ...actual, hashBlob: vi.fn(async () => 'a'.repeat(64)) };
});

const { uploadFile } = await import('../api/files');
const { hashBlob } = await import('../api/mediaTasks');
const { clearAllCache, openCacheDb } = await import('../cache/db');
const { enqueueOutbox } = await import('../cache/outbox');
const { hasCachedMedia } = await import('../cache/mediaCache');
const { useChatStore } = await import('./chatStore');

const CHAT = 'chat-upload';
const CLIENT = 'client-upload';
const SHA = 'a'.repeat(64);

function pending(): MessageDto {
  return {
    id: -1,
    chatId: CHAT,
    clientId: CLIENT,
    albumId: null,
    sender: null,
    type: 'MEDIA',
    content: null,
    attachment: null,
    replyToId: null,
    replyTo: null,
    forwardedFrom: null,
    call: null,
    announcement: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  } as MessageDto;
}

async function queueDocument(): Promise<void> {
  await enqueueOutbox({
    clientId: CLIENT,
    chatId: CHAT,
    content: null,
    replyToId: null,
    attachment: {
      blob: new Blob(['документ'], { type: 'application/pdf' }),
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      duration: null,
      peaks: null,
    },
    createdAt: 1,
    attempts: 0,
  });
  useChatStore.setState({ messagesByChat: { [CHAT]: [{ ...pending(), status: 'sending' }] } });
}

async function storedAttempts(): Promise<number | undefined> {
  const db = await openCacheDb();
  return (await db?.get('outbox', CLIENT))?.attempts;
}

function hangUntilAborted(...args: Parameters<typeof uploadFile>): ReturnType<typeof uploadFile> {
  const signal = args[3];
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe('выгрузка вложения из очереди', () => {
  beforeEach(async () => {
    useChatStore.getState().reset();
    await clearAllCache();
    vi.mocked(uploadFile).mockReset();
    vi.mocked(hashBlob).mockClear();
    socket.emit.mockReset();
  });

  it('вход сокета во время идущей выгрузки не запускает вторую и не тратит попытку', async () => {
    await queueDocument();
    vi.mocked(uploadFile).mockImplementation(hangUntilAborted);

    await useChatStore.getState().drainOutbox();
    await flush();
    await useChatStore.getState().drainOutbox();
    await flush();

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(await storedAttempts()).toBe(1);
  });

  it('sha256 запоминается в очереди и повтор его не пересчитывает', async () => {
    await queueDocument();
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error('сервер отказал'));

    await useChatStore.getState().runAttachmentUpload(CHAT, CLIENT);
    await flush();
    expect(hashBlob).toHaveBeenCalledTimes(1);

    vi.mocked(uploadFile).mockImplementation(hangUntilAborted);
    void useChatStore.getState().runAttachmentUpload(CHAT, CLIENT);
    await flush();

    expect(hashBlob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadFile).mock.calls[1]?.[4]).toBe(SHA);
  });

  it('отправленный файл кладётся в кэш под серверным fileId', async () => {
    await queueDocument();
    vi.mocked(uploadFile).mockResolvedValue({ id: 'server-file', mimeType: 'application/pdf', size: 16, url: '', sha256: SHA });
    socket.emit.mockImplementation((_event: string, _payload: unknown, ack: (value: unknown) => void) => {
      ack({ ok: true, message: { ...pending(), id: 10 } });
    });

    await useChatStore.getState().runAttachmentUpload(CHAT, CLIENT);
    await flush();

    expect(await hasCachedMedia('server-file')).toBe(true);
  });
});
