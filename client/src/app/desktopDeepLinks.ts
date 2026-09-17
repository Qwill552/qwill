import { useEffect, useRef } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

import { getPendingDesktopDeepLink, subscribeToDesktopDeepLinks, type DesktopDeepLinkTarget } from '../native/desktop';

function openDeepLinkTarget(target: DesktopDeepLinkTarget, navigate: NavigateFunction): void {
  navigate(target.type === 'chat' ? `/chats/${target.id}` : `/u/${target.id}`);
}

export function useDesktopDeepLinks(): void {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    void getPendingDesktopDeepLink().then((target) => {
      if (target) openDeepLinkTarget(target, navigateRef.current);
    });

    return subscribeToDesktopDeepLinks((target) => openDeepLinkTarget(target, navigateRef.current));
  }, []);
}
