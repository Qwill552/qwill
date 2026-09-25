import { create } from 'zustand';

export interface ConnectionStatus {
  online: boolean;
  socketConnected: boolean;
  ipBanned: boolean;
  updating: boolean;
}

export type TitleKind = 'brand' | 'waiting' | 'connecting' | 'updating' | 'ipBanned';

export const TITLE_SHOW_DELAY_MS = 300;

export const useConnectionStatus = create<ConnectionStatus>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  socketConnected: false,
  ipBanned: false,
  updating: false,
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useConnectionStatus.setState({ online: true }));
  window.addEventListener('offline', () => useConnectionStatus.setState({ online: false }));
}

export function titleKindOf(status: ConnectionStatus): TitleKind {
  if (status.ipBanned) return 'ipBanned';
  if (!status.online) return 'waiting';
  if (!status.socketConnected) return 'connecting';
  if (status.updating) return 'updating';
  return 'brand';
}

export function titleDelayMs(kind: TitleKind): number {
  return kind === 'connecting' || kind === 'updating' ? TITLE_SHOW_DELAY_MS : 0;
}

export async function trackUpdating(work: Promise<void>): Promise<void> {
  useConnectionStatus.setState({ updating: true });
  try {
    await work;
  } finally {
    useConnectionStatus.setState({ updating: false });
  }
}
