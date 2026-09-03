import type { AttachmentDto, MessageDto } from '@messenger/shared';
import { create } from 'zustand';

import { useChatStore } from '../../stores/chatStore';
import { isViewableMedia } from './mediaKind';

export interface MediaViewerItem {
  messageId: number;
  attachment: AttachmentDto;
  senderName: string;
  createdAt: string;
  own: boolean;
}

interface MediaViewerState {
  chatId: string | null;
  items: MediaViewerItem[];
  index: number;
  readOnly: boolean;
  detached: boolean;
  open: (chatId: string, attachmentId: string) => void;
  openList: (chatId: string, items: MediaViewerItem[], attachmentId: string) => void;
  setIndex: (index: number) => void;
  dropMessage: (messageId: number) => void;
  close: () => void;
}

function toItems(messages: MessageDto[], myId: string | null): MediaViewerItem[] {
  const items: MediaViewerItem[] = [];

  for (const message of messages) {
    const attachment = message.attachment;
    if (!attachment || message.deletedAt || message.id <= 0) continue;
    if (!isViewableMedia(attachment)) continue;
    items.push({
      messageId: message.id,
      attachment,
      senderName: message.sender?.displayName ?? '',
      createdAt: message.createdAt,
      own: message.sender?.id === myId,
    });
  }

  return items;
}

function collect(chatId: string): MediaViewerItem[] {
  const chat = useChatStore.getState();
  return toItems(chat.messagesByChat[chatId] ?? [], chat.myUserId);
}

let readOnlySource: { chatId: string; messages: () => MessageDto[] } | null = null;

export function setReadOnlyMediaSource(chatId: string, messages: () => MessageDto[]): () => void {
  readOnlySource = { chatId, messages };
  return () => {
    if (readOnlySource?.chatId === chatId) readOnlySource = null;
  };
}

export const useMediaViewerStore = create<MediaViewerState>((set, get) => ({
  chatId: null,
  items: [],
  index: 0,
  readOnly: false,
  detached: false,

  open(chatId, attachmentId) {
    const readOnly = readOnlySource?.chatId === chatId;
    const items = readOnly ? toItems(readOnlySource!.messages(), null) : collect(chatId);
    const index = items.findIndex((item) => item.attachment.id === attachmentId);
    if (index < 0) return;
    set({ chatId, items, index, readOnly, detached: false });
  },

  openList(chatId, items, attachmentId) {
    const index = items.findIndex((item) => item.attachment.id === attachmentId);
    if (index < 0) return;
    set({ chatId, items, index, readOnly: false, detached: true });
  },

  setIndex(index) {
    const { items } = get();
    set({ index: Math.min(items.length - 1, Math.max(0, index)) });
  },

  dropMessage(messageId) {
    const { items, index } = get();
    const next = items.filter((item) => item.messageId !== messageId);
    if (next.length === 0) {
      set({ chatId: null, items: [], index: 0, readOnly: false, detached: false });
      return;
    }
    set({ items: next, index: Math.min(next.length - 1, index) });
  },

  close() {
    set({ chatId: null, items: [], index: 0, readOnly: false, detached: false });
  },
}));

export function openMediaViewer(chatId: string, attachmentId: string): void {
  useMediaViewerStore.getState().open(chatId, attachmentId);
}

export function openMediaViewerList(chatId: string, items: MediaViewerItem[], attachmentId: string): void {
  useMediaViewerStore.getState().openList(chatId, items, attachmentId);
}

// Снимок, открытый в просмотрщике, могли удалить с другого устройства/вкладки — свой
// deleteMessage (MediaViewer.handleConfirmDelete) вызывает dropMessage сам, для чужого
// удаления нужна эта подписка (R-15, «Проверка руками», п.9).
useChatStore.subscribe((state) => {
  const { chatId, items, readOnly, detached } = useMediaViewerStore.getState();
  if (readOnly || detached || !chatId || items.length === 0) return;
  const list = state.messagesByChat[chatId];
  if (!list) return;
  for (const item of items) {
    if (!list.some((m) => m.id === item.messageId)) {
      useMediaViewerStore.getState().dropMessage(item.messageId);
    }
  }
});
