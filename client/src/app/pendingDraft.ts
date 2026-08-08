export interface PendingDraft {
  chatId: string;
  text: string;
}

const STORAGE_KEY = 'qwill:update-draft';

let provider: (() => PendingDraft | null) | null = null;

export function setPendingDraftProvider(next: (() => PendingDraft | null) | null): void {
  provider = next;
}

export function stashPendingDraft(): void {
  const draft = provider?.() ?? null;
  if (!draft || draft.text.trim().length === 0) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    return;
  }
}

export function takePendingDraft(chatId: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    localStorage.removeItem(STORAGE_KEY);
    const draft = JSON.parse(raw) as PendingDraft;
    return draft.chatId === chatId ? draft.text : null;
  } catch {
    return null;
  }
}
