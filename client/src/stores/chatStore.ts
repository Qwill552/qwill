import type { ChatDto, ChatListItemDto, MessageDto, MessageSendAck, PublicUser } from '@messenger/shared';
import { SocketEvent } from '@messenger/shared';
import { create } from 'zustand';

import {
  createPrivateChatRequest,
  getChatRequest,
  getMessagesRequest,
  listChatsRequest,
} from '../api/chats';
import { getSocket } from '../realtime/socket';

/** Локальное расширение сообщения статусом оптимистичной отправки — на сервер не уходит. */
export type LocalMessage = MessageDto & { status?: 'sending' | 'failed' };

interface ChatState {
  chats: ChatListItemDto[];
  messagesByChat: Record<string, LocalMessage[]>;
  hasMoreByChat: Record<string, boolean>;
  chatsLoaded: boolean;
  chatError: string | null;

  loadChats: () => Promise<void>;
  openChat: (chatId: string) => Promise<void>;
  loadMore: (chatId: string) => Promise<void>;
  startPrivateChat: (username: string) => Promise<ChatDto>;
  sendMessage: (chatId: string, content: string, sender: PublicUser) => void;
  subscribeToSocket: () => void;
  reset: () => void;
  /** Внутренний метод: применяет message:new и ack от message:send по одной логике реконсиляции. */
  applyIncomingMessage: (message: MessageDto) => void;
}

function upsertChat(chats: ChatListItemDto[], chat: ChatListItemDto): ChatListItemDto[] {
  return [chat, ...chats.filter((c) => c.id !== chat.id)];
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messagesByChat: {},
  hasMoreByChat: {},
  chatsLoaded: false,
  chatError: null,

  async loadChats() {
    const { chats } = await listChatsRequest();
    set({ chats, chatsLoaded: true });
  },

  async openChat(chatId) {
    set({ chatError: null });

    if (!get().chats.some((c) => c.id === chatId)) {
      try {
        const chat = await getChatRequest(chatId);
        set((state) => ({ chats: upsertChat(state.chats, chat) }));
      } catch {
        set({ chatError: 'Чат не найден или недоступен' });
        return;
      }
    }

    if (get().messagesByChat[chatId]) return;

    const page = await getMessagesRequest(chatId);
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: page.messages },
      hasMoreByChat: { ...state.hasMoreByChat, [chatId]: page.hasMore },
    }));
  },

  async loadMore(chatId) {
    const current = get().messagesByChat[chatId] ?? [];
    const oldest = current.find((m) => m.id > 0);
    if (!oldest) return;

    const page = await getMessagesRequest(chatId, oldest.id);
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: [...page.messages, ...current] },
      hasMoreByChat: { ...state.hasMoreByChat, [chatId]: page.hasMore },
    }));
  },

  async startPrivateChat(username) {
    const chat = await createPrivateChatRequest({ username });
    set((state) => ({ chats: upsertChat(state.chats, chat) }));
    return chat;
  },

  sendMessage(chatId, content, sender) {
    const socket = getSocket();
    if (!socket) return;

    const clientId = crypto.randomUUID();
    const optimistic: LocalMessage = {
      id: -Date.now(),
      chatId,
      clientId,
      sender,
      type: 'TEXT',
      content,
      replyToId: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };

    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...(state.messagesByChat[chatId] ?? []), optimistic],
      },
    }));

    socket.emit(SocketEvent.MessageSend, { chatId, clientId, content }, (ack: MessageSendAck) => {
      if (ack.ok && ack.message) {
        get().applyIncomingMessage(ack.message);
        return;
      }
      set((state) => ({
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: (state.messagesByChat[chatId] ?? []).map((m) =>
            m.clientId === clientId ? { ...m, status: 'failed' } : m,
          ),
        },
      }));
    });
  },

  subscribeToSocket() {
    const socket = getSocket();
    if (!socket) return;

    socket.off(SocketEvent.MessageNew).on(SocketEvent.MessageNew, (message: MessageDto) => {
      get().applyIncomingMessage(message);
    });

    socket.off(SocketEvent.ChatCreated).on(SocketEvent.ChatCreated, (chat: ChatDto) => {
      set((state) => ({ chats: upsertChat(state.chats, chat) }));
    });
  },

  reset() {
    set({ chats: [], messagesByChat: {}, hasMoreByChat: {}, chatsLoaded: false, chatError: null });
  },

  // Не часть публичного интерфейса стора — вызывается изнутри при message:new и после ack.
  applyIncomingMessage(message: MessageDto) {
    set((state) => {
      const list = state.messagesByChat[message.chatId];
      if (list) {
        const pendingIndex = list.findIndex((m) => m.clientId === message.clientId && m.id < 0);
        let nextList: LocalMessage[];
        if (pendingIndex !== -1) {
          nextList = [...list];
          nextList[pendingIndex] = message;
        } else if (list.some((m) => m.id === message.id)) {
          nextList = list;
        } else {
          nextList = [...list, message];
        }
        state = { ...state, messagesByChat: { ...state.messagesByChat, [message.chatId]: nextList } };
      }

      const chat = state.chats.find((c) => c.id === message.chatId);
      if (!chat) return state;
      const updatedChat: ChatListItemDto = { ...chat, lastMessage: message, updatedAt: message.createdAt };
      return { ...state, chats: upsertChat(state.chats, updatedChat) };
    });
  },
}));
