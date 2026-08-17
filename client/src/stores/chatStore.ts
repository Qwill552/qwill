import type {
  CallDto,
  CallEndedEvent,
  CallInviteEvent,
  CallLiveEvent,
  CallParticipantChangedEvent,
  ChatDto,
  ChatListItemDto,
  ChatMemberSummary,
  ChatPinnedEvent,
  ChatReadEvent,
  ChatUpdatedEvent,
  GroupMemberDTO,
  MemberChangedEvent,
  MessageActionAck,
  MessageAttachmentInput,
  MessageBatchAck,
  MessageDeletedBatchEvent,
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

import { getLiveCallsRequest } from '../api/calls';
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
import { NetworkError } from '../api/client';
import { generateImageThumbnail, generateVideoThumbnail, uploadFile } from '../api/files';
import { openCacheDb, type OutboxAttachment } from '../cache/db';
import { readCachedChats, readCachedMessages, writeCachedChats, writeCachedMessages } from '../cache/messageCache';
import {
  bumpAttempts,
  dequeueOutbox,
  enqueueOutbox,
  MAX_OUTBOX_ATTEMPTS,
  outboxAttachmentToFile,
  readOutbox,
} from '../cache/outbox';
import { mergeSyncedMessages, syncAllCachedChats, syncChat } from '../cache/syncEngine';
import { traceCall } from '../calls/callTrace';
import {
  consumeNativeAccept,
  hasPendingNativeAccept,
  isNativeCallAvailable,
  reportCallEnded,
  reportIncomingCall,
} from '../calls/nativeCall';
import { getSocket } from '../realtime/socket';
import { useAuthStore } from './authStore';
import { useCallStore } from './callStore';

export type LocalAttachmentKind = 'image' | 'video' | 'voice' | 'file';

export interface LocalAttachmentState {
  kind: LocalAttachmentKind;
  previewUrl?: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

/** Локальное расширение сообщения статусом оптимистичной отправки и черновиком вложения
 *  до подтверждения сервером — на сервер не уходит (этап 7, ux-ui/07-composer.md). */
export type LocalMessage = MessageDto & { status?: 'sending' | 'failed'; localAttachment?: LocalAttachmentState };

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
  /** Закреплённое сообщение открытого чата — обновляется из ChatDto и chat:pinned (этап 6). */
  pinnedByChat: Record<string, MessageDto | null>;
  activeCallByChat: Record<string, CallDto>;
  /** Режим мультивыбора ленты — общий на всё приложение, так как открыт ровно один чат за раз (этап 6). */
  selectionMode: boolean;
  selectedIds: Set<number>;

  loadChats: () => Promise<void>;
  openChat: (chatId: string) => Promise<void>;
  closeChat: () => void;
  loadMore: (chatId: string) => Promise<void>;
  syncChatMessages: (chatId: string) => Promise<void>;
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
  ) => Promise<void>;
  /** Вложение — оптимистичный пузырь с локальным превью появляется сразу, а не после ack
   *  (этап 7): file уходит на загрузку в фоне, прогресс и ошибка живут в localAttachment. */
  sendAttachmentMessage: (
    chatId: string,
    sender: PublicUser,
    file: File,
    options?: { caption?: string; replyTo?: MessageDto; duration?: number; peaks?: number[] },
  ) => Promise<void>;
  /** Отмена во время загрузки — убирает оптимистичный пузырь целиком, а не переводит в failed. */
  cancelAttachmentUpload: (chatId: string, clientId: string) => void;
  /** Повтор после обрыва сети — тот же clientId, сервер дедуплицирует (секция 3). */
  retryMessage: (chatId: string, clientId: string) => void;
  /** Правка и удаление резолвятся/реджектятся по ack — компонент показывает ошибку сам (секция 6). */
  editMessage: (chatId: string, messageId: number, content: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: number) => Promise<void>;
  deleteMessagesBatch: (chatId: string, messageIds: number[]) => Promise<void>;
  /** toChatId=null снимает закреп (то же, что messageId=null на сервере). */
  pinMessage: (chatId: string, messageId: number | null) => void;
  forwardMessages: (fromChatId: string, toChatId: string, messageIds: number[]) => Promise<void>;
  toggleReaction: (chatId: string, messageId: number, emoji: string) => void;
  markRead: (chatId: string, messageId: number) => void;
  /** Мультивыбор (секция 3, ux-ui/06): long-press по пузырю/пустой зоне строки. */
  enterSelection: (messageId: number) => void;
  toggleSelected: (messageId: number) => void;
  exitSelection: () => void;
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
  subscribeToSocket: (myUserId: string) => void;
  drainOutbox: () => Promise<void>;
  restoreOutboxMessages: () => Promise<void>;
  reset: () => void;
  /** Внутренний метод: применяет message:new и ack от message:send по одной логике реконсиляции. */
  applyIncomingMessage: (message: MessageDto) => void;
  /** Внутренний метод: заменяет сообщение по id — message:updated/message:deleted (этап 6). */
  applyMessageUpdate: (message: MessageDto) => void;
  /** Внутренний метод: обновляет только реакции сообщения по id — message:reaction (этап 6). */
  applyReactionUpdate: (event: MessageReactionEvent) => void;
  /** Внутренний метод: заменяет пачку сообщений разом — message:deletedBatch (этап 6). */
  applyMessagesBatchUpdate: (messages: MessageDto[]) => void;
  /** Внутренний метод: обновляет закреп чата — из ChatDto или chat:pinned (этап 6). */
  applyChatPinned: (event: ChatPinnedEvent) => void;
  /** Внутренний метод: заводит/обновляет чат по ChatDto — из REST-ответа или chat:created. */
  applyChatDetail: (chat: ChatDto) => void;
  /** Внутренний метод: применяет member:changed — из REST-ответа группового действия или socket-broadcast (этап 7). */
  applyMemberChanged: (event: MemberChangedEvent) => void;
  /** Внутренний метод: применяет chat:updated — смена названия/аватара группы (этап 7). */
  applyChatUpdated: (event: ChatUpdatedEvent) => void;
  /** Внутренний метод: обрабатывает user:typing с автогашением по таймеру. */
  setTyping: (event: UserTypingEvent) => void;
  /** Внутренний метод: гоняет хэш/превью/загрузку/emit одного вложения, вызывается и при
   *  первой отправке, и при повторе (этап 7). */
  runAttachmentUpload: (chatId: string, clientId: string) => Promise<void>;
  /** Внутренний метод: точечно обновляет прогресс/ошибку localAttachment по clientId. */
  updateLocalAttachment: (chatId: string, clientId: string, patch: Partial<LocalAttachmentState>) => void;
  /** Внутренний метод: помечает сообщение неотправленным по clientId. */
  setMessageFailed: (chatId: string, clientId: string) => void;
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

const uploadAbortControllers = new Map<string, AbortController>();

const CALL_START_SYNC_TIMEOUT_MS = 8000;

/** Догон истории при реконнекте ждёт, пока принятый из системного интерфейса звонок дойдёт до
 *  звука: иначе холодный старт тратит первые секунды на IndexedDB и синк вместо звонка. */
function afterCallStarts(run: () => void): void {
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    unsubscribe();
    run();
  };

  const unsubscribe = useCallStore.subscribe((state) => {
    if (state.phase === 'active' || state.phase === 'ended') finish();
  });
  const timer = setTimeout(finish, CALL_START_SYNC_TIMEOUT_MS);
}

function typingKey(chatId: string, userId: string): string {
  return `${chatId}:${userId}`;
}

function attachmentKind(mimeType: string, hasPeaks: boolean): LocalAttachmentKind {
  if (hasPeaks) return 'voice';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function outboxAttachmentToLocalAttachment(attachment: OutboxAttachment): LocalAttachmentState {
  const kind = attachmentKind(attachment.mimeType, attachment.peaks !== null);
  return {
    kind,
    previewUrl: kind === 'image' || kind === 'video' ? URL.createObjectURL(attachment.blob) : undefined,
    name: attachment.fileName,
    size: attachment.blob.size,
    progress: 0,
  };
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
  pinnedByChat: {},
  activeCallByChat: {},
  selectionMode: false,
  selectedIds: new Set(),

  async loadChats() {
    if (!get().chatsLoaded) {
      const cached = await readCachedChats();
      if (cached.length > 0 && !get().chatsLoaded) {
        set((state) => {
          let presenceByUser = state.presenceByUser;
          for (const chat of cached) {
            if (chat.otherMember) presenceByUser = seedPresence(presenceByUser, [chat.otherMember]);
          }
          return { chats: cached, presenceByUser };
        });
      }
    }

    let chats: ChatListItemDto[];
    try {
      ({ chats } = await listChatsRequest());
    } catch (error) {
      if (error instanceof NetworkError) return;
      throw error;
    }

    set((state) => {
      let presenceByUser = state.presenceByUser;
      for (const chat of chats) {
        if (chat.otherMember) presenceByUser = seedPresence(presenceByUser, [chat.otherMember]);
      }
      return { chats, chatsLoaded: true, presenceByUser };
    });
    void writeCachedChats(chats);
    void get().restoreOutboxMessages();
  },

  async openChat(chatId) {
    set({ chatError: null, activeChatId: chatId });

    try {
      const chat = await getChatRequest(chatId);
      get().applyChatDetail(chat);
    } catch (error) {
      if (!(error instanceof NetworkError)) {
        set({ chatError: 'Чат не найден или недоступен' });
        return;
      }
    }

    if (!get().messagesByChat[chatId]) {
      const cached = await readCachedMessages(chatId);
      if (cached.length > 0 && !get().messagesByChat[chatId]) {
        set((state) => ({ messagesByChat: { ...state.messagesByChat, [chatId]: cached } }));
        void get().restoreOutboxMessages();
      }

      try {
        const page = await getMessagesRequest(chatId);
        set((state) => ({
          messagesByChat: { ...state.messagesByChat, [chatId]: page.messages },
          hasMoreByChat: { ...state.hasMoreByChat, [chatId]: page.hasMore },
        }));
        void writeCachedMessages(page.messages);
        void get().restoreOutboxMessages();
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
        return;
      }
    }

    const messages = get().messagesByChat[chatId] ?? [];
    const lastReal = [...messages].reverse().find((m) => m.id > 0);
    if (lastReal) get().markRead(chatId, lastReal.id);
  },

  closeChat() {
    set({ activeChatId: null, selectionMode: false, selectedIds: new Set() });
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

  async syncChatMessages(chatId) {
    const result = await syncChat(chatId);
    if (!result) return;

    set((state) => {
      const current = state.messagesByChat[chatId];
      if (!current) return {};
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: mergeSyncedMessages(current, result.created, result.changed) as LocalMessage[],
        },
      };
    });
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

  async sendMessage(chatId, content, sender, attachment, replyTo) {
    const socket = getSocket();
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
      // Отправка сообщения не пересылает — оптимистичное сообщение никогда не forwarded.
      forwardedFrom: null,
      call: null,
      reactions: [],
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };

    await enqueueOutbox({
      clientId,
      chatId,
      content: content || null,
      replyToId: replyTo?.id ?? null,
      attachment: null,
      createdAt: Date.now(),
      attempts: 0,
    });

    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...(state.messagesByChat[chatId] ?? []), optimistic],
      },
    }));

    if (!socket) return;

    socket.emit(
      SocketEvent.MessageSend,
      { chatId, clientId, content: content || undefined, attachment, replyToId: replyTo?.id },
      (ack: MessageSendAck) => {
        if (ack.ok && ack.message) {
          void dequeueOutbox(clientId);
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

  async sendAttachmentMessage(chatId, sender, file, options = {}) {
    const socket = getSocket();
    if (!socket) return;

    const clientId = crypto.randomUUID();
    const kind = attachmentKind(file.type, Boolean(options.peaks));
    const previewUrl = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : undefined;
    const replyTo = options.replyTo;

    const optimistic: LocalMessage = {
      id: -Date.now(),
      chatId,
      clientId,
      sender,
      type: 'MEDIA',
      content: options.caption || null,
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
      forwardedFrom: null,
      call: null,
      reactions: [],
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'sending',
      localAttachment: { kind, previewUrl, name: file.name, size: file.size, progress: 0 },
    };

    await enqueueOutbox({
      clientId,
      chatId,
      content: options.caption || null,
      replyToId: replyTo?.id ?? null,
      attachment: {
        blob: file,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        duration: options.duration ?? null,
        peaks: options.peaks ?? null,
      },
      createdAt: Date.now(),
      attempts: 0,
    });

    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...(state.messagesByChat[chatId] ?? []), optimistic],
      },
    }));

    void get().runAttachmentUpload(chatId, clientId);
  },

  async runAttachmentUpload(chatId, clientId) {
    const db = await openCacheDb();
    const entry = await db?.get('outbox', clientId);
    if (!entry?.attachment) return;

    const file = outboxAttachmentToFile(entry.attachment);
    const duration = entry.attachment.duration ?? undefined;
    const peaks = entry.attachment.peaks ?? undefined;

    const controller = new AbortController();
    uploadAbortControllers.set(clientId, controller);
    get().updateLocalAttachment(chatId, clientId, { progress: 0, error: undefined });
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: (state.messagesByChat[chatId] ?? []).map((m) =>
          m.clientId === clientId ? { ...m, status: 'sending' } : m,
        ),
      },
    }));

    try {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      let thumbnailFileId: string | undefined;
      let thumbnailSha256: string | undefined;
      let width: number | undefined;
      let height: number | undefined;
      let videoDuration: number | undefined;

      if (isImage) {
        const thumb = await generateImageThumbnail(file);
        const uploadedThumb = await uploadFile(thumb.file, 'message', undefined, controller.signal);
        thumbnailFileId = uploadedThumb.id;
        thumbnailSha256 = uploadedThumb.sha256;
        width = thumb.width;
        height = thumb.height;
      } else if (isVideo) {
        const thumb = await generateVideoThumbnail(file);
        const uploadedThumb = await uploadFile(thumb.file, 'message', undefined, controller.signal);
        thumbnailFileId = uploadedThumb.id;
        thumbnailSha256 = uploadedThumb.sha256;
        width = thumb.width;
        height = thumb.height;
        videoDuration = thumb.duration;
      }

      const uploaded = await uploadFile(
        file,
        'message',
        (loaded, total) => get().updateLocalAttachment(chatId, clientId, { progress: total ? loaded / total : 0 }),
        controller.signal,
      );

      const message = get().messagesByChat[chatId]?.find((m) => m.clientId === clientId);
      if (!message) return;

      const attachment: MessageAttachmentInput = {
        fileId: uploaded.id,
        sha256: uploaded.sha256,
        thumbnailFileId,
        thumbnailSha256,
        originalName: file.name,
        width,
        height,
        duration: duration ?? videoDuration,
        peaks,
      };

      const socket = getSocket();
      if (!socket) throw new Error('Нет соединения');

      socket.emit(
        SocketEvent.MessageSend,
        { chatId, clientId, content: message.content || undefined, attachment, replyToId: message.replyToId ?? undefined },
        (ack: MessageSendAck) => {
          uploadAbortControllers.delete(clientId);
          if (ack.ok && ack.message) {
            void dequeueOutbox(clientId);
            get().applyIncomingMessage(ack.message);
            return;
          }
          get().updateLocalAttachment(chatId, clientId, { error: ack.error?.message ?? 'Не удалось отправить' });
          get().setMessageFailed(chatId, clientId);
        },
      );
    } catch (error) {
      uploadAbortControllers.delete(clientId);
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof NetworkError) return;
      get().updateLocalAttachment(chatId, clientId, {
        error: error instanceof Error ? error.message : 'Не удалось загрузить файл',
      });
      get().setMessageFailed(chatId, clientId);
    }
  },

  cancelAttachmentUpload(chatId, clientId) {
    uploadAbortControllers.get(clientId)?.abort();
    uploadAbortControllers.delete(clientId);
    void dequeueOutbox(clientId);

    set((state) => {
      const list = state.messagesByChat[chatId];
      if (!list) return state;
      const target = list.find((m) => m.clientId === clientId);
      if (target?.localAttachment?.previewUrl) URL.revokeObjectURL(target.localAttachment.previewUrl);
      return { messagesByChat: { ...state.messagesByChat, [chatId]: list.filter((m) => m.clientId !== clientId) } };
    });
  },

  retryMessage(chatId, clientId) {
    const message = get().messagesByChat[chatId]?.find((m) => m.clientId === clientId);
    if (!message || message.status !== 'failed') return;

    if (message.localAttachment) {
      void get().runAttachmentUpload(chatId, clientId);
      return;
    }

    const socket = getSocket();
    if (!socket) return;

    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: (state.messagesByChat[chatId] ?? []).map((m) =>
          m.clientId === clientId ? { ...m, status: 'sending' } : m,
        ),
      },
    }));

    socket.emit(
      SocketEvent.MessageSend,
      { chatId, clientId, content: message.content || undefined, replyToId: message.replyToId ?? undefined },
      (ack: MessageSendAck) => {
        if (ack.ok && ack.message) {
          get().applyIncomingMessage(ack.message);
          return;
        }
        get().setMessageFailed(chatId, clientId);
      },
    );
  },

  async drainOutbox() {
    const socket = getSocket();
    if (!socket?.connected) return;

    for (const entry of await readOutbox()) {
      if (entry.attachment) {
        const attempts = await bumpAttempts(entry.clientId);
        if (attempts > MAX_OUTBOX_ATTEMPTS) {
          get().setMessageFailed(entry.chatId, entry.clientId);
          continue;
        }
        void get().runAttachmentUpload(entry.chatId, entry.clientId);
        continue;
      }

      const attempts = await bumpAttempts(entry.clientId);
      if (attempts > MAX_OUTBOX_ATTEMPTS) {
        get().setMessageFailed(entry.chatId, entry.clientId);
        continue;
      }

      socket.emit(
        SocketEvent.MessageSend,
        {
          chatId: entry.chatId,
          clientId: entry.clientId,
          content: entry.content ?? undefined,
          replyToId: entry.replyToId ?? undefined,
        },
        (ack: MessageSendAck) => {
          if (ack.ok && ack.message) {
            void dequeueOutbox(entry.clientId);
            get().applyIncomingMessage(ack.message);
          }
        },
      );
    }
  },

  async restoreOutboxMessages() {
    const me = useAuthStore.getState().user;

    for (const entry of await readOutbox()) {
      const list = get().messagesByChat[entry.chatId];
      if (!list || list.some((m) => m.clientId === entry.clientId)) continue;

      const localAttachment = entry.attachment ? outboxAttachmentToLocalAttachment(entry.attachment) : undefined;

      const restored: LocalMessage = {
        id: -entry.createdAt,
        chatId: entry.chatId,
        clientId: entry.clientId,
        sender: me,
        type: entry.attachment ? 'MEDIA' : 'TEXT',
        content: entry.content,
        attachment: null,
        replyToId: entry.replyToId,
        replyTo: null,
        forwardedFrom: null,
        call: null,
        reactions: [],
        editedAt: null,
        deletedAt: null,
        createdAt: new Date(entry.createdAt).toISOString(),
        status: 'sending',
        localAttachment,
      };

      set((state) => ({
        messagesByChat: {
          ...state.messagesByChat,
          [entry.chatId]: [...(state.messagesByChat[entry.chatId] ?? []), restored],
        },
      }));
    }
  },

  updateLocalAttachment(chatId, clientId, patch) {
    set((state) => {
      const list = state.messagesByChat[chatId];
      if (!list) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: list.map((m) =>
            m.clientId === clientId && m.localAttachment ? { ...m, localAttachment: { ...m.localAttachment, ...patch } } : m,
          ),
        },
      };
    });
  },

  setMessageFailed(chatId, clientId) {
    set((state) => {
      const list = state.messagesByChat[chatId];
      if (!list) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: list.map((m) => (m.clientId === clientId ? { ...m, status: 'failed' } : m)),
        },
      };
    });
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

  deleteMessagesBatch(chatId, messageIds) {
    const socket = getSocket();
    if (!socket) return Promise.resolve();

    return new Promise((resolve, reject) => {
      socket.emit(SocketEvent.MessageDeleteBatch, { chatId, messageIds }, (ack: MessageBatchAck) => {
        if (ack.ok && ack.messages) {
          get().applyMessagesBatchUpdate(ack.messages);
          get().exitSelection();
          resolve();
          return;
        }
        reject(new Error(ack.error?.message ?? 'Не удалось удалить сообщения'));
      });
    });
  },

  pinMessage(chatId, messageId) {
    // Итог приходит broadcast'ом chat:pinned — в комнату входит и сам закрепивший (bootstrapSocket).
    getSocket()?.emit(SocketEvent.ChatPin, { chatId, messageId });
  },

  forwardMessages(fromChatId, toChatId, messageIds) {
    const socket = getSocket();
    if (!socket) return Promise.resolve();

    return new Promise((resolve, reject) => {
      socket.emit(SocketEvent.MessageForward, { fromChatId, toChatId, messageIds }, (ack: MessageBatchAck) => {
        if (ack.ok) {
          // Пришедшие сообщения принадлежат toChatId — если это открытый чат, message:new
          // уже применит их через broadcast; здесь только закрываем мультивыбор источника.
          get().exitSelection();
          resolve();
          return;
        }
        reject(new Error(ack.error?.message ?? 'Не удалось переслать сообщения'));
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

  enterSelection(messageId) {
    set({ selectionMode: true, selectedIds: new Set([messageId]) });
  },

  toggleSelected(messageId) {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      // Снятие последнего выбора выходит из режима мультивыбора (ux-ui/06, «Готово когда»).
      return next.size === 0 ? { selectionMode: false, selectedIds: next } : { selectedIds: next };
    });
  },

  exitSelection() {
    set({ selectionMode: false, selectedIds: new Set() });
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

    socket.off(SocketEvent.MessageDeletedBatch).on(SocketEvent.MessageDeletedBatch, (event: MessageDeletedBatchEvent) => {
      get().applyMessagesBatchUpdate(event.messages);
    });

    socket.off(SocketEvent.ChatPinned).on(SocketEvent.ChatPinned, (event: ChatPinnedEvent) => {
      get().applyChatPinned(event);
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

    socket.off(SocketEvent.CallInvite).on(SocketEvent.CallInvite, (event: CallInviteEvent) => {
      traceCall('call:invite получен', event.call.id);
      const callerName = event.call.initiator?.displayName ?? '';
      if (consumeNativeAccept(event.call.id)) {
        void useCallStore.getState().joinCall(event.call.id);
      } else if (isNativeCallAvailable()) {
        void reportIncomingCall(event.call.id, callerName, event.call.kind);
      } else {
        useCallStore.getState().applyInvite(event.call);
      }
      set((state) => ({ activeCallByChat: { ...state.activeCallByChat, [event.call.chatId]: event.call } }));
    });

    socket.off(SocketEvent.CallLive).on(SocketEvent.CallLive, (event: CallLiveEvent) => {
      useCallStore.getState().applyLiveCalls(event.calls);
      set((state) => {
        const activeCallByChat = { ...state.activeCallByChat };
        for (const call of event.calls) activeCallByChat[call.chatId] = call;
        return { activeCallByChat };
      });
    });

    socket.off(SocketEvent.CallEnded).on(SocketEvent.CallEnded, (event: CallEndedEvent) => {
      traceCall('call:ended получен', event.call.id);
      void reportCallEnded(event.call.id);
      useCallStore.getState().applyEnded(event.call);
      set((state) => {
        const activeCallByChat = { ...state.activeCallByChat };
        delete activeCallByChat[event.call.chatId];
        return { activeCallByChat };
      });
    });

    socket
      .off(SocketEvent.CallParticipantChanged)
      .on(SocketEvent.CallParticipantChanged, (event: CallParticipantChangedEvent) => {
        useCallStore.getState().applyCallUpdate(event.call);
        set((state) => ({ activeCallByChat: { ...state.activeCallByChat, [event.call.chatId]: event.call } }));
      });

    socket.off('connect').on('connect', () => {
      socket.emit(SocketEvent.VisibilityChange, { visible: document.visibilityState === 'visible' });
      const activeChatId = get().activeChatId;
      const sync = (): void => {
        void syncAllCachedChats().then(() => {
          if (activeChatId) void get().syncChatMessages(activeChatId);
        });
        void get().drainOutbox();
      };

      if (hasPendingNativeAccept()) afterCallStarts(sync);
      else sync();

      void getLiveCallsRequest()
        .then((response) => useCallStore.getState().applyLiveCalls(response.calls))
        .catch(() => undefined);
    });
  },

  reset() {
    for (const timer of typingTimers.values()) clearTimeout(timer);
    typingTimers.clear();
    for (const controller of uploadAbortControllers.values()) controller.abort();
    uploadAbortControllers.clear();
    for (const list of Object.values(get().messagesByChat)) {
      for (const message of list) {
        if (message.localAttachment?.previewUrl) URL.revokeObjectURL(message.localAttachment.previewUrl);
      }
    }
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
      pinnedByChat: {},
  activeCallByChat: {},
      selectionMode: false,
      selectedIds: new Set(),
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
          const previewUrl = list[pendingIndex]?.localAttachment?.previewUrl;
          if (previewUrl) URL.revokeObjectURL(previewUrl);
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

    void writeCachedMessages([message]);

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

      // Правка/удаление закреплённого сообщения обновляет и баннер закрепа без похода на сервер.
      const pinnedByChat =
        state.pinnedByChat[message.chatId]?.id === message.id
          ? { ...state.pinnedByChat, [message.chatId]: message }
          : state.pinnedByChat;

      return { messagesByChat: nextMessagesByChat, chats, pinnedByChat };
    });
  },

  // Не часть публичного интерфейса стора — то же самое, что applyMessageUpdate, но для пачки разом (message:deletedBatch).
  applyMessagesBatchUpdate(messages: MessageDto[]) {
    for (const message of messages) get().applyMessageUpdate(message);
  },

  // Не часть публичного интерфейса стора — chat:pinned broadcast или собственный ack pinMessage.
  applyChatPinned(event: ChatPinnedEvent) {
    set((state) => ({ pinnedByChat: { ...state.pinnedByChat, [event.chatId]: event.message } }));
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
      pinnedByChat: { ...state.pinnedByChat, [chat.id]: chat.pinnedMessage },
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
