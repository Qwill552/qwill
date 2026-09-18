import type { MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const emitWhenReadyMock = vi.fn<(event: string, payload: unknown) => void>();

vi.mock('../realtime/socket', () => ({
  getSocket: vi.fn(() => null),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  emitWhenReady: emitWhenReadyMock,
}));

vi.mock('../cache/messageCache', () => ({
  CACHED_HISTORY_LIMIT: 200,
  readCachedChats: vi.fn(async () => []),
  writeCachedChats: vi.fn(async () => undefined),
  readCachedMessages: vi.fn(async () => []),
  readCachedPosition: vi.fn(async () => null),
  writeCachedPosition: vi.fn(async () => undefined),
  writeCachedMessages: vi.fn(async () => undefined),
  removeCachedMessages: vi.fn(async () => undefined),
  removeCachedChat: vi.fn(async () => undefined),
  pruneCachedHistory: vi.fn(async () => undefined),
}));

const { writeCachedMessages } = await import('../cache/messageCache');
const { useChatStore } = await import('./chatStore');

const CHAT_ID = 'chat-reaction-1';

function message(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 7,
    chatId: CHAT_ID,
    clientId: null,
    albumId: null,
    sender: null,
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
    createdAt: new Date(2026, 0, 1, 12, 0, 0).toISOString(),
    ...overrides,
  };
}

describe('chatStore: реакции переживают перезагрузку', () => {
  beforeEach(() => {
    vi.mocked(writeCachedMessages).mockClear();
    emitWhenReadyMock.mockReset();
    useChatStore.setState({ chats: [], messagesByChat: {} });
  });

  it('applyReactionUpdate кладёт сообщение с реакциями в кэш', () => {
    useChatStore.setState({ messagesByChat: { [CHAT_ID]: [message()] } });

    useChatStore.getState().applyReactionUpdate({
      chatId: CHAT_ID,
      messageId: 7,
      reactions: [{ emoji: '👍', userIds: ['u1'] }],
    });

    expect(writeCachedMessages).toHaveBeenCalledTimes(1);
    const [written] = vi.mocked(writeCachedMessages).mock.calls[0]!;
    expect(written).toEqual([expect.objectContaining({ id: 7, reactions: [{ emoji: '👍', userIds: ['u1'] }] })]);
  });

  it('applyReactionUpdate не трогает кэш, если сообщения нет в ленте', () => {
    useChatStore.setState({ messagesByChat: {} });

    useChatStore.getState().applyReactionUpdate({
      chatId: CHAT_ID,
      messageId: 7,
      reactions: [{ emoji: '👍', userIds: ['u1'] }],
    });

    expect(writeCachedMessages).not.toHaveBeenCalled();
  });

  it('toggleReaction не теряется, когда сокет ещё не поднят', () => {
    useChatStore.getState().toggleReaction(CHAT_ID, 7, '👍');

    expect(emitWhenReadyMock).toHaveBeenCalledWith('message:react', {
      chatId: CHAT_ID,
      messageId: 7,
      emoji: '👍',
    });
  });

  it('pinMessage не теряется, когда сокет ещё не поднят', () => {
    useChatStore.getState().pinMessage(CHAT_ID, 7);

    expect(emitWhenReadyMock).toHaveBeenCalledWith('chat:pin', { chatId: CHAT_ID, messageId: 7 });
  });
});
