import type { ChatListItemDto, MessageActionAck, MessageDto } from '@messenger/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

type SocketAck = (ack: MessageActionAck) => void;

const emitMock = vi.fn<(event: string, payload: unknown, ack: SocketAck) => void>();

vi.mock('../realtime/socket', () => ({
  getSocket: vi.fn(() => ({ emit: emitMock })),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

const { useChatStore } = await import('./chatStore');

const CHAT_ID = 'chat-delete-1';

function message(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 1,
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

function listItem(overrides: Partial<ChatListItemDto> = {}): ChatListItemDto {
  return {
    id: CHAT_ID,
    type: 'PRIVATE',
    title: 'Борис',
    avatarUrl: null,
    otherMember: null,
    lastMessage: null,
    updatedAt: new Date().toISOString(),
    unreadCount: 0,
    muted: false,
    isSupportRequest: false,
    ...overrides,
  };
}

describe('chatStore: удаление сообщения не оставляет надгробие в ленте (R-15)', () => {
  beforeEach(() => {
    emitMock.mockReset();
    useChatStore.setState({
      chats: [],
      messagesByChat: {},
      pinnedByChat: {},
    });
  });

  it('applyMessageUpdate с deletedAt убирает сообщение из ленты, а не заменяет надгробием', () => {
    const m1 = message({ id: 1, content: 'первое' });
    const m2 = message({ id: 2, content: 'второе' });
    useChatStore.setState({
      chats: [listItem({ lastMessage: m2 })],
      messagesByChat: { [CHAT_ID]: [m1, m2] },
    });

    useChatStore.getState().applyMessageUpdate({ ...m2, content: null, deletedAt: new Date().toISOString() });

    const list = useChatStore.getState().messagesByChat[CHAT_ID];
    expect(list?.map((m) => m.id)).toEqual([1]);
  });

  it('удаление последнего сообщения чата откатывает превью к предыдущему из локальной ленты', () => {
    const m1 = message({ id: 1, content: 'первое' });
    const m2 = message({ id: 2, content: 'второе' });
    useChatStore.setState({
      chats: [listItem({ lastMessage: m2 })],
      messagesByChat: { [CHAT_ID]: [m1, m2] },
    });

    useChatStore.getState().applyMessageUpdate({ ...m2, content: null, deletedAt: new Date().toISOString() });

    const chat = useChatStore.getState().chats.find((c) => c.id === CHAT_ID);
    expect(chat?.lastMessage?.id).toBe(1);
  });

  it('удаление единственного сообщения чата даёт lastMessage: null', () => {
    const m1 = message({ id: 1 });
    useChatStore.setState({
      chats: [listItem({ lastMessage: m1 })],
      messagesByChat: { [CHAT_ID]: [m1] },
    });

    useChatStore.getState().applyMessageUpdate({ ...m1, content: null, deletedAt: new Date().toISOString() });

    const chat = useChatStore.getState().chats.find((c) => c.id === CHAT_ID);
    expect(chat?.lastMessage).toBeNull();
  });

  it('удаление закреплённого сообщения снимает закреп', () => {
    const m1 = message({ id: 1 });
    useChatStore.setState({
      chats: [listItem({ lastMessage: m1 })],
      messagesByChat: { [CHAT_ID]: [m1] },
      pinnedByChat: { [CHAT_ID]: m1 },
    });

    useChatStore.getState().applyMessageUpdate({ ...m1, content: null, deletedAt: new Date().toISOString() });

    expect(useChatStore.getState().pinnedByChat[CHAT_ID]).toBeNull();
  });

  it('deleteMessage убирает пузырь оптимистично, до ack', () => {
    const m1 = message({ id: 1 });
    useChatStore.setState({
      chats: [listItem({ lastMessage: m1 })],
      messagesByChat: { [CHAT_ID]: [m1] },
    });

    void useChatStore.getState().deleteMessage(CHAT_ID, 1);

    expect(useChatStore.getState().messagesByChat[CHAT_ID]).toEqual([]);
    expect(emitMock).toHaveBeenCalledTimes(1);
  });

  it('deleteMessage при отказе сервера возвращает сообщение на место', async () => {
    const m1 = message({ id: 1, content: 'первое' });
    const m2 = message({ id: 2, content: 'второе' });
    useChatStore.setState({
      chats: [listItem({ lastMessage: m2 })],
      messagesByChat: { [CHAT_ID]: [m1, m2] },
    });

    emitMock.mockImplementation((_event, _payload, ack) => {
      ack({ ok: false, error: { code: 'FORBIDDEN', message: 'нет прав' } });
    });

    await expect(useChatStore.getState().deleteMessage(CHAT_ID, 2)).rejects.toThrow('нет прав');

    const list = useChatStore.getState().messagesByChat[CHAT_ID];
    expect(list?.map((m) => m.id)).toEqual([1, 2]);
    const chat = useChatStore.getState().chats.find((c) => c.id === CHAT_ID);
    expect(chat?.lastMessage?.id).toBe(2);
  });
});
