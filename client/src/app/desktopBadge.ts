import { useEffect } from 'react';

import { isDesktopShell, setDesktopBadgeCount } from '../native/desktop';
import { useChatStore } from '../stores/chatStore';

export function useDesktopBadgeSync(): void {
  const unreadTotal = useChatStore((s) => s.chats.reduce((sum, c) => sum + c.unreadCount, 0));

  useEffect(() => {
    if (!isDesktopShell()) return;
    setDesktopBadgeCount(unreadTotal);
  }, [unreadTotal]);
}
