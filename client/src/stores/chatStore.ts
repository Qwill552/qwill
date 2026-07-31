import type {
  ChatDto,
  ChatListItemDto,
  ChatMemberSummary,
  ChatReadEvent,
  ChatUpdatedEvent,
  GroupMemberDTO,
  MemberChangedEvent,
  MessageActionAck,
  MessageAttachmentInput,
  MessageDto,
  MessageReactionEvent,
  MessageSendAck,
  MessageUpdatedEvent,
  PublicUser,
  UpdateGroupInput,
  UserPresenceEvent,
  UserTypingEvent,
} from '@messenger/shared';
import { SocketEvent, TYPING_TIMEOUT_MS } from '@messenger/shared';
import { create } from 'zustand';

import {
  addMemberRequest,
  createGroupRequest,
  createPrivateChatRequest,
  getChatRequest,
  getMembersRequest,
  getMessagesRequest,
  leaveGroupRequest,
  listChatsRequest,
  removeMemberRequest,
  transferOwnershipRequest,
  updateGroupRequest,
  updateMemberRoleRequest,
} from '../api/chats';
import { getSocket } from '../realtime/socket';

/** Локальное расширение сообщения статусом оптимистичной отправки — на сервер не уходит. */
export type LocalMessage = MessageDto & { status?: 'sending' | 'failed' };

interface PresenceInfo {
  online: boolean;
  lastSeenAt: string;
}

interface TypingUser {
  userId: string;
  displayName: string;
}

interface ChatState {
  chats: ChatListItemDto[];
  messagesByChat: Record<string, LocalMessage[]>;
  hasMoreByChat: Record<string, boolean>;
  /** lastReadMessageId каждого участника чата — по нему считаются галочки прочтения (секция 3). */
  readCursorsByChat: Record<string, Record<string, number | null>>;
  /** Кто печатает в чате прямо сейчас, кроме меня самого. */
  typingByChat: Record<string, TypingUser[]>;
  /** Онлайн-статус известных клиенту пользователей (секция 3). */
  presenceByUser: Record<string, PresenceInfo>;
  chatsLoaded: boolean;
  chatError: string | null;
  myUserId: string | null;
  /** Чат, открытый в текущей вкладке — новые сообщения в нём читаются сразу же (секция 8). */
  activeChatId: string | null;
  /** Участники группы с ролями — грузятся отдельно от ChatDto.members (панель управления группой, этап 7). */
  membersByChat: Record<string, GroupMemberDTO[]>;
  /** chatId группы, из которой меня только что удалили/я вышел — компонент страницы сам решает, что делать
   *  (обычно редирект на /chats), и сбрасывает флаг через clearKicked (этап 7). */
  kickedChatId: string | null;

  loadChats: () => Promise<void>;
  openChat: (chatId: string) => Promise<void>;
  closeChat: () => void;
  loadMore: (chatId: string) => Promise<void>;
  startPrivateChat: (username: string) => Promise<ChatDto>;
  createGroup: (title: string, usernames: string[]) => Promise<ChatDto>;
  loadMembers: (chatId: string) => Promise<void>;
  addMember: (chatId: string, username: string) => Promise<void>;
  removeMember: (chatId: string, userId: string) => Promise<void>;
  updateMemberRole: (chatId: string, userId: string, role: 'ADMIN' | 'MEMBER') => Promise<void>;
  leaveGroup: (chatId: string) => Promise<void>;
  transferOwnership: (chatId: string, username: string) => Promise<void>;
  updateGroupInfo: (chatId: string, input: UpdateGroupInput) => Promise<void>;
  clearKicked: () => void;
  sendMessage: (
    chatId: string,
    content: string,
    sender: PublicUser,
    attachment?: MessageAttachmentInput,
    replyTo?: MessageDto,
  ) => void;
  /** Правка и удаление резолвятся/реджектятся по ack — компонент показывает ошибку сам (секция 6). */
  editMessage: (chatId: string, messageId: number, content: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: number) => Promise<void>;
  toggleReaction: (chatId: string, messageId: number, emoji: string) => void;
  markRead: (chatId: string, messageId: number) => void;
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
  subscribeToSocket: (myUserId: string) => void;
  reset: () => void;
  /** Внутренний метод: применяет message:new и ack от message:send по одной логике реконсиляции. */
  applyIncomingMessage: (message: MessageDto) => void;
  /** Внутренний метод: заменяет сообщение по id — message:updated/message:deleted (этап 6). */
  applyMessageUpdate: (message: MessageDto) => void;
  /** Внутренний метод: обновляет только реакции сообщения по id — message:reaction (этап 6). */
  applyReactionUpdate: (event: MessageReactionEvent) => void;
  /** Внутренний метод: заводит/обновляет чат по ChatDto — из REST-ответа или chat:created. */
  applyChatDetail: (chat: ChatDto) => void;
  /** Внутренний метод: применяет member:changed — из REST-ответа группового действия или socket-broadcast (этап 7). */
  applyMemberChanged: (event: MemberChangedEvent) => void;
  /** Внутренний метод: применяет chat:updated — смена названия/аватара группы (этап 7). */
  applyChatUpdated: (event: ChatUpdatedEvent) => void;
  /** Внутренний метод: обрабатывает user:typing с автогашением по таймеру. */
  setTyping: (event: UserTypingEvent) => void;
}

function upsertChat(chats: ChatListItemDto[], chat: ChatListItemDto): ChatListItemDto[] {
  return [chat, ...chats.filter((c) => c.id !== chat.id)];
}

/** Заполняет presence только для новых пользователей — не затирает уже известный live-статус. */
function seedPresence(
  presence: Record<string, PresenceInfo>,
  members: ChatMemberSummary[],
): Record<string, PresenceInfo> {
  let next = presence;
  for (const member of members) {
    if (!(member.id in next)) {
      if (next === presence) next = { ...presence };
      next[member.id] = { online: false, lastSeenAt: member.lastSeenAt };
    }
  }
  return next;
}

// Таймеры автогашения «печатает» — вне стора, ключ `${chatId}:${userId}` (секция 3: TYPING_TIMEOUT_MS).
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function typingKey(chatId: string, userId: string): string {
  return `${chatId}:${userId}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messagesByChat: {},
  hasMoreByChat: {},
  readCursorsByChat: {},
  typingByChat: {},
  presenceByUser: {},
  chatsLoaded: false,
  chatError: null,
  myUserId: null,
  activeChatId: null,
  membersByChat: {},
  kickedChatId: null,

  async loadChats() {
    const { chats } = await listChatsRequest();
    set((state) => {
      let presenceByUser = state.presenceByUser;
      for (const chat of chats) {
        if (chat.otherMember) presenceByUser = seedPresence(presenceByUser, [chat.otherMember]);
      }
      return { chats, chatsLoaded: true, presenceByUser };
    });
  },

  async openChat(chatId) {
    set({ chatError: null, activeChatId: chatId });

    try {
      const chat = await getChatRequest(chatId);
      get().applyChatDetail(chat);
    } catch {
      set({ chatError: 'Чат не найден или недоступен' });
      return;
    }

    if (!get().messagesByChat[chatId]) {
      const page = await getMessagesRequest(chatId);
      set((state) => ({
        messagesByChat: { ...state.messagesByChat, [chatId]: page.messages },
        hasMoreByChat: { ...state.hasMoreByChat, [chatId]: page.hasMore },
      }));
    }

    const messages = get().messagesByChat[chatId] ?? [];
    const lastReal = [...messages].reverse().find((m) => m.id > 0);
    if (lastReal) get().markRead(chatId, lastReal.id);
  },

  closeChat() {
    set({ activeChatId: null });
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
    get().applyChatDetail(chat);
    return chat;
  },

  async createGroup(title, usernames) {
    const chat = await createGroupRequest({ title, usernames });
    get().applyChatDetail(chat);
    return chat;
  },

  async loadMembers(chatId) {
    const { members } = await getMembersRequest(chatId);
    set((state) => ({ membersByChat: { ...state.membersByChat, [chatId]: members } }));
  },

  async addMember(chatId, username) {
    const member = await addMemberRequest(chatId, username);
    get().applyMemberChanged({ type: 'added', chatId, member });
  },

  async removeMember(chatId, userId) {
    await removeMemberRequest(chatId, userId);
    get().applyMemberChanged({ type: 'removed', chatId, userId });
  },

  async updateMemberRole(chatId, userId, role) {
    const member = await updateMemberRoleRequest(chatId, userId, { role });
    get().applyMemberChanged({ type: 'role', chatId, userId: member.userId, role: member.role });
  },

  async leaveGroup(chatId) {
    const userId = get().myUserId;
    await leaveGroupRequest(chatId);
    if (userId) get().applyMemberChanged({ type: 'left', chatId, userId });
  },

  async transferOwnership(chatId, username) {
    const { members } = await transferOwnershipRequest(chatId, username);
    for (const member of members) {
      get().applyMemberChanged({ type: 'role', chatId, userId: member.userId, role: member.role });
    }
  },

  async updateGroupInfo(chatId, input) {
    const event = await updateGroupRequest(chatId, input);
    get().applyChatUpdated(event);
  },

  clearKicked() {
    set({ kickedChatId: null });
  },

  sendMessage(chatId, content, sender, attachment, replyTo) {
    const socket = getSocket();
    if (!socket) return;

    const clientId = crypto.randomUUID();
    const optimistic: LocalMessage = {
      id: -Date.now(),
      chatId,
      clientId,
      sender,
      type: attachment ? 'MEDIA' : 'TEXT',
      content: content || null,
      // Вложение появится в ленте только после ack — превью во время отправки не показываем (см. композер).
      attachment: null,
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderName: replyTo.sender?.displayName ?? 'Удалённый аккаунт',
            content: replyTo.deletedAt ? null : replyTo.content,
            hasAttachment: !replyTo.deletedAt && !!replyTo.attachment,
            deletedAt: replyTo.deletedAt,
          }
        : null,
      reactions: [],
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

    socket.emit(
      SocketEvent.MessageSend,
      { chatId, clientId, content: content || undefined, attachment, replyToId: replyTo?.id },
      (ack: MessageSendAck) => {
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
      },
    );
  },

  editMessage(chatId, messageId, content) {
    const socket = getSocket();
    if (!socket) return Promise.resolve();

    return new Promise((resolve, reject) => {
      socket.emit(SocketEvent.MessageEdit, { chatId, messageId, content }, (ack: MessageActionAck) => {
        if (ack.ok && ack.message) {
          get().applyMessageUpdate(ack.message);
          resolve();
          return;
        }
        reject(new Error(ack.error?.message ?? 'Не удалось изменить сообщение'));
      });
    });
  },

  deleteMessage(chatId, messageId) {
    const socket = getSocket();
    if (!socket) return Promise.resolve();

    return new Promise((resolve, reject) => {
      socket.emit(SocketEvent.MessageDelete, { chatId, messageId }, (ack: MessageActionAck) => {
        if (ack.ok && ack.message) {
          get().applyMessageUpdate(ack.message);
          resolve();
          return;
        }
        reject(new Error(ack.error?.message ?? 'Не удалось удалить сообщение'));
      });
    });
  },

  toggleReaction(chatId, messageId, emoji) {
    // Итог приходит broadcast'ом message:reaction — в комнату входит и сам отправитель (bootstrapSocket).
    getSocket()?.emit(SocketEvent.MessageReact, { chatId, messageId, emoji });
  },

  markRead(chatId, messageId) {
    getSocket()?.emit(SocketEvent.ChatRead, { chatId, messageId });
  },

  startTyping(chatId) {
    getSocket()?.emit(SocketEvent.TypingStart, { chatId });
  },

  stopTyping(chatId) {
    getSocket()?.emit(SocketEvent.TypingStop, { chatId });
  },

  subscribeToSocket(myUserId) {
    set({ myUserId });
    const socket = getSocket();
    if (!socket) return;

    socket.off(SocketEvent.MessageNew).on(SocketEvent.MessageNew, (message: MessageDto) => {
      get().applyIncomingMessage(message);
    });

    socket.off(SocketEvent.MessageUpdated).on(SocketEvent.MessageUpdated, (event: MessageUpdatedEvent) => {
      get().applyMessageUpdate(event.message);
    });

    socket.off(SocketEvent.MessageDeleted).on(SocketEvent.MessageDeleted, (event: MessageUpdatedEvent) => {
      get().applyMessageUpdate(event.message);
    });

    socket.off(SocketEvent.MessageReaction).on(SocketEvent.MessageReaction, (event: MessageReactionEvent) => {
      get().applyReactionUpdate(event);
    });

    socket.off(SocketEvent.ChatCreated).on(SocketEvent.ChatCreated, (chat: ChatDto) => {
      get().applyChatDetail(chat);
    });

    socket.off(SocketEvent.MemberChanged).on(SocketEvent.MemberChanged, (event: MemberChangedEvent) => {
      get().applyMemberChanged(event);
    });

    socket.off(SocketEvent.ChatUpdated).on(SocketEvent.ChatUpdated, (event: ChatUpdatedEvent) => {
      get().applyChatUpdated(event);
    });

    socket.off(SocketEvent.ChatRead).on(SocketEvent.ChatRead, (event: ChatReadEvent) => {
      set((state) => {
        const cursors = { ...(state.readCursorsByChat[event.chatId] ?? {}) };
        cursors[event.userId] = event.lastReadMessageId;
        // Прочтение с любого устройства гасит собственный бейдж непрочитанного (секция 8).
        const chats =
          event.userId === state.myUserId
            ? state.chats.map((c) => (c.id === event.chatId ? { ...c, unreadCount: 0 } : c))
            : state.chats;
        return {
          readCursorsByChat: { ...state.readCursorsByChat, [event.chatId]: cursors },
          chats,
        };
      });
    });

    socket.off(SocketEvent.UserTyping).on(SocketEvent.UserTyping, (event: UserTypingEvent) => {
      get().setTyping(event);
    });

    socket.off(SocketEvent.UserPresence).on(SocketEvent.UserPresence, (event: UserPresenceEvent) => {
      set((state) => ({
        presenceByUser: {
          ...state.presenceByUser,
          [event.userId]: { online: event.online, lastSeenAt: event.lastSeenAt },
        },
      }));
    });
  },

  reset() {
    for (const timer of typingTimers.values()) clearTimeout(timer);
    typingTimers.clear();
    set({
      chats: [],
      messagesByChat: {},
      hasMoreByChat: {},
      readCursorsByChat: {},
      typingByChat: {},
      presenceByUser: {},
      chatsLoaded: false,
      chatError: null,
      myUserId: null,
      activeChatId: null,
      membersByChat: {},
      kickedChatId: null,
    });
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

      const isMine = message.sender?.id === state.myUserId;
      const isActive = state.activeChatId === message.chatId;
      const unreadCount = isMine ? chat.unreadCount : isActive ? 0 : chat.unreadCount + 1;

      const updatedChat: ChatListItemDto = {
        ...chat,
        lastMessage: message,
        updatedAt: message.createdAt,
        unreadCount,
      };
      return { ...state, chats: upsertChat(state.chats, updatedChat) };
    });

    const state = get();
    if (state.activeChatId === message.chatId && message.sender?.id !== state.myUserId && message.id > 0) {
      get().markRead(message.chatId, message.id);
    }
  },

  // Не часть публичного интерфейса стора — заменяет сообщение по id (правка/удаление уже собраны сервером).
  applyMessageUpdate(message: MessageDto) {
    set((state) => {
      const list = state.messagesByChat[message.chatId];
      const nextMessagesByChat = list
        ? {
            ...state.messagesByChat,
            [message.chatId]: list.map((m) => (m.id === message.id ? { ...message, status: m.status } : m)),
          }
        : state.messagesByChat;

      const chat = state.chats.find((c) => c.id === message.chatId);
      const chats =
        chat?.lastMessage?.id === message.id
          ? state.chats.map((c) => (c.id === message.chatId ? { ...c, lastMessage: message } : c))
          : state.chats;

      return { messagesByChat: nextMessagesByChat, chats };
    });
  },

  // Не часть публичного интерфейса стора — обновляет только набор реакций сообщения по id.
  applyReactionUpdate(event: MessageReactionEvent) {
    set((state) => {
      const list = state.messagesByChat[event.chatId];
      const nextMessagesByChat = list
        ? {
            ...state.messagesByChat,
            [event.chatId]: list.map((m) => (m.id === event.messageId ? { ...m, reactions: event.reactions } : m)),
          }
        : state.messagesByChat;

      const chat = state.chats.find((c) => c.id === event.chatId);
      const chats =
        chat?.lastMessage?.id === event.messageId
          ? state.chats.map((c) =>
              c.id === event.chatId ? { ...c, lastMessage: { ...c.lastMessage!, reactions: event.reactions } } : c,
            )
          : state.chats;

      return { messagesByChat: nextMessagesByChat, chats };
    });
  },

  applyChatDetail(chat: ChatDto) {
    set((state) => ({
      chats: upsertChat(state.chats, chat),
      readCursorsByChat: { ...state.readCursorsByChat, [chat.id]: chat.readCursors },
      presenceByUser: seedPresence(state.presenceByUser, chat.members),
    }));
  },

  // Не часть публичного интерфейса стора — вызывается и из REST-ответа группового действия
  // (для мгновенной обратной связи инициатору), и из socket-broadcast member:changed (для остальных).
  // Идемпотентен, чтобы двойное применение одного и того же события не создавало дублей.
  applyMemberChanged(event: MemberChangedEvent) {
    set((state) => {
      const members = state.membersByChat[event.chatId];
      let nextMembers: GroupMemberDTO[] | undefined = members;

      if (event.type === 'added') {
        if (members && !members.some((m) => m.userId === event.member.userId)) {
          nextMembers = [...members, event.member];
        }
      } else if (event.type === 'removed' || event.type === 'left') {
        if (members) nextMembers = members.filter((m) => m.userId !== event.userId);
      } else {
        if (members) nextMembers = members.map((m) => (m.userId === event.userId ? { ...m, role: event.role } : m));
      }

      const membersByChat =
        nextMembers && nextMembers !== members
          ? { ...state.membersByChat, [event.chatId]: nextMembers }
          : state.membersByChat;

      // «removed»/«left» про самого себя — чат закрыт для меня, страница сама решает, что делать (этап 7).
      const isSelfGone = (event.type === 'removed' || event.type === 'left') && event.userId === state.myUserId;
      const chats = isSelfGone ? state.chats.filter((c) => c.id !== event.chatId) : state.chats;
      const kickedChatId = isSelfGone ? event.chatId : state.kickedChatId;

      return { membersByChat, chats, kickedChatId };
    });
  },

  // Не часть публичного интерфейса стора — обновляет название/аватар группы в списке чатов.
  applyChatUpdated(event: ChatUpdatedEvent) {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === event.chatId ? { ...c, title: event.title, avatarUrl: event.avatarUrl } : c,
      ),
    }));
  },

  setTyping(event: UserTypingEvent) {
    const key = typingKey(event.chatId, event.userId);
    const existingTimer = typingTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    typingTimers.delete(key);

    if (!event.isTyping) {
      set((state) => ({
        typingByChat: {
          ...state.typingByChat,
          [event.chatId]: (state.typingByChat[event.chatId] ?? []).filter((u) => u.userId !== event.userId),
        },
      }));
      return;
    }

    typingTimers.set(
      key,
      setTimeout(() => {
        typingTimers.delete(key);
        set((state) => ({
          typingByChat: {
            ...state.typingByChat,
            [event.chatId]: (state.typingByChat[event.chatId] ?? []).filter((u) => u.userId !== event.userId),
          },
        }));
      }, TYPING_TIMEOUT_MS),
    );

    set((state) => {
      const current = state.typingByChat[event.chatId] ?? [];
      if (current.some((u) => u.userId === event.userId)) return state;
      return {
        typingByChat: {
          ...state.typingByChat,
          [event.chatId]: [...current, { userId: event.userId, displayName: event.displayName }],
        },
      };
    });
  },
}));
