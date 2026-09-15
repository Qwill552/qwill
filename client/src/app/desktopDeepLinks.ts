import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { getPendingDesktopDeepLink, subscribeToDesktopDeepLinks, type DesktopDeepLinkTarget } from '../native/desktop';
import { useChatStore } from '../stores/chatStore';

async function openDeepLinkTarget(target: DesktopDeepLinkTarget, navigate: (path: string) => void): Promise<void> {
  if (target.type === 'chat') {
    navigate(`/chats/${target.id}`);
    return;
  }

  try {
    const chat = await useChatStore.getState().startPrivateChat(target.id);
    navigate(`/chats/${chat.id}`);
  } catch {
    return;
  }
}

export function useDesktopDeepLinks(): void {
  const navigate = useNavigate();

  useEffect(() => {
    void getPendingDesktopDeepLink().then((target) => {
      if (target) void openDeepLinkTarget(target, navigate);
    });

    return subscribeToDesktopDeepLinks((target) => void openDeepLinkTarget(target, navigate));
  }, [navigate]);
}
