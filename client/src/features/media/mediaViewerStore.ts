import type { AttachmentDto } from '@messenger/shared';
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
  open: (chatId: string, attachmentId: string) => void;
  setIndex: (index: number) => void;
  dropMessage: (messageId: number) => void;
  close: () => void;
}

function collect(chatId: string): MediaViewerItem[] {
  const chat = useChatStore.getState();
  const messages = chat.messagesByChat[chatId] ?? [];
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
      own: message.sender?.id === chat.myUserId,
    });
  }

  return items;
}

export const useMediaViewerStore = create<MediaViewerState>((set, get) => ({
  chatId: null,
  items: [],
  index: 0,

  open(chatId, attachmentId) {
    const items = collect(chatId);
    const index = items.findIndex((item) => item.attachment.id === attachmentId);
    if (index < 0) return;
    set({ chatId, items, index });
  },

  setIndex(index) {
    const { items } = get();
    set({ index: Math.min(items.length - 1, Math.max(0, index)) });
  },

  dropMessage(messageId) {
    const { items, index } = get();
    const next = items.filter((item) => item.messageId !== messageId);
    if (next.length === 0) {
      set({ chatId: null, items: [], index: 0 });
      return;
    }
    set({ items: next, index: Math.min(next.length - 1, index) });
  },

  close() {
    set({ chatId: null, items: [], index: 0 });
  },
}));

export function openMediaViewer(chatId: string, attachmentId: string): void {
  useMediaViewerStore.getState().open(chatId, attachmentId);
}

// Снимок, открытый в просмотрщике, могли удалить с другого устройства/вкладки — свой
// deleteMessage (MediaViewer.handleConfirmDelete) вызывает dropMessage сам, для чужого
// удаления нужна эта подписка (R-15, «Проверка руками», п.9).
useChatStore.subscribe((state) => {
  const { chatId, items } = useMediaViewerStore.getState();
  if (!chatId || items.length === 0) return;
  const list = state.messagesByChat[chatId];
  if (!list) return;
  for (const item of items) {
    if (!list.some((m) => m.id === item.messageId)) {
      useMediaViewerStore.getState().dropMessage(item.messageId);
    }
  }
});
