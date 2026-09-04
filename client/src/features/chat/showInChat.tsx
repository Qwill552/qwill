import { useCallback, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useChatStore } from '../../stores/chatStore';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { haptic } from '../../ui/haptic';
import { Menu } from '../../ui/Menu';

export function useShowInChat(): (chatId: string, messageId: number) => Promise<void> {
  const navigate = useNavigate();

  return useCallback(
    async (chatId: string, messageId: number) => {
      const store = useChatStore.getState();
      const loaded = store.messagesByChat[chatId]?.some((m) => m.id === messageId) ?? false;
      if (loaded) store.focusMessage(chatId, messageId);
      else await store.openChatAt(chatId, messageId);
      navigate(`/chats/${chatId}`);
    },
    [navigate],
  );
}

interface ShowInChatMenu {
  open: (messageId: number, anchor: DOMRect) => void;
  node: ReactNode;
}

export function useShowInChatMenu(chatId: string): ShowInChatMenu {
  const showInChat = useShowInChat();
  const [target, setTarget] = useState<{ messageId: number; anchor: DOMRect } | null>(null);

  const open = useCallback((messageId: number, anchor: DOMRect) => setTarget({ messageId, anchor }), []);

  const node = target ? (
    <Menu
      anchor={target.anchor}
      onClose={() => setTarget(null)}
      items={[
        {
          id: 'show-in-chat',
          label: 'Показать в чате',
          icon: 'chats',
          onSelect: () => void showInChat(chatId, target.messageId),
        },
      ]}
    />
  ) : null;

  return { open, node };
}

export function useShowInChatTrigger(messageId: number, open: ShowInChatMenu['open']) {
  const anchorRef = useRef<DOMRect | null>(null);
  const firedRef = useRef(false);

  const longPress = useLongPress({
    onLongPress: () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      firedRef.current = true;
      haptic();
      open(messageId, anchor);
    },
  });

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      anchorRef.current = event.currentTarget.getBoundingClientRect();
      longPress.onPointerDown(event);
    },
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerCancel: longPress.onPointerCancel,
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      open(messageId, event.currentTarget.getBoundingClientRect());
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!firedRef.current) return;
      firedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
