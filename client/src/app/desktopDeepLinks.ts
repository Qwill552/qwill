import { useEffect, useRef } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

import { getPendingDesktopDeepLink, subscribeToDesktopDeepLinks, type DesktopDeepLinkTarget } from '../native/desktop';
import { useChatStore } from '../stores/chatStore';

async function openDeepLinkTarget(target: DesktopDeepLinkTarget, navigate: NavigateFunction): Promise<void> {
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
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    void getPendingDesktopDeepLink().then((target) => {
      if (target) void openDeepLinkTarget(target, navigateRef.current);
    });

    return subscribeToDesktopDeepLinks((target) => void openDeepLinkTarget(target, navigateRef.current));
  }, []);
}
