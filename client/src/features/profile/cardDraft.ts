const STORAGE_PREFIX = 'qwill:card-draft:';

function keyFor(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readCardDraft(userId: string): string | null {
  try {
    return localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

export function writeCardDraft(userId: string, html: string): void {
  try {
    localStorage.setItem(keyFor(userId), html);
  } catch {
    return;
  }
}

export function clearCardDraft(userId: string): void {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    return;
  }
}
