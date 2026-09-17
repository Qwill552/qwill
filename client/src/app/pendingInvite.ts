const STORAGE_KEY = 'qwill.pendingInvite';

export function rememberPendingInvite(path: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    return;
  }
}

export function takePendingInvite(): string | null {
  try {
    const path = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    return path;
  } catch {
    return null;
  }
}
