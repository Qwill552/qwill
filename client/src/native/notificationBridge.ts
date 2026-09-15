export interface DesktopNotificationItem {
  id: number;
  chatId: string;
  title: string;
  body: string;
  time: string;
  avatarColor: string | null;
}

export interface NotificationPopupBridge {
  onShow(handler: (item: unknown) => void): () => void;
  onCloseChat(handler: (chatId: unknown) => void): () => void;
  onTheme(handler: (theme: unknown) => void): () => void;
  open(chatId: string): void;
  resize(height: number): void;
}

declare global {
  interface Window {
    qwillNotifications?: NotificationPopupBridge;
  }
}

function bridge(): NotificationPopupBridge | null {
  return typeof window === 'undefined' ? null : (window.qwillNotifications ?? null);
}

function parseItem(raw: unknown): DesktopNotificationItem | null {
  const candidate = raw as Partial<DesktopNotificationItem> | null;
  if (!candidate || typeof candidate.id !== 'number' || typeof candidate.chatId !== 'string') return null;

  return {
    id: candidate.id,
    chatId: candidate.chatId,
    title: typeof candidate.title === 'string' ? candidate.title : '',
    body: typeof candidate.body === 'string' ? candidate.body : '',
    time: typeof candidate.time === 'string' ? candidate.time : '',
    avatarColor: typeof candidate.avatarColor === 'string' ? candidate.avatarColor : null,
  };
}

export function subscribeToNotificationShow(handler: (item: DesktopNotificationItem) => void): () => void {
  const target = bridge();
  if (!target) return () => undefined;

  return target.onShow((raw) => {
    const item = parseItem(raw);
    if (item) handler(item);
  });
}

export function subscribeToNotificationCloseChat(handler: (chatId: string) => void): () => void {
  const target = bridge();
  if (!target) return () => undefined;

  return target.onCloseChat((chatId) => {
    if (typeof chatId === 'string') handler(chatId);
  });
}

export function subscribeToNotificationTheme(handler: (theme: 'light' | 'dark') => void): () => void {
  const target = bridge();
  if (!target) return () => undefined;

  return target.onTheme((theme) => {
    if (theme === 'light' || theme === 'dark') handler(theme);
  });
}

export function openNotificationPopup(chatId: string): void {
  bridge()?.open(chatId);
}

export function resizeNotificationPopup(height: number): void {
  bridge()?.resize(height);
}
