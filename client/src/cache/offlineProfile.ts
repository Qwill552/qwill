import type { PublicUser } from '@messenger/shared';

const STORAGE_KEY = 'messenger.offlineProfile';

export function saveOfflineProfile(user: PublicUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function readOfflineProfile(): PublicUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function clearOfflineProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}
