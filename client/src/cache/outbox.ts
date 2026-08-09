import { openCacheDb, type OutboxAttachment, type OutboxEntry } from './db';

export const MAX_OUTBOX_ATTEMPTS = 8;

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;

export function nextRetryDelayMs(attempts: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS);
}

export async function enqueueOutbox(entry: OutboxEntry): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await db.put('outbox', entry);
}

export async function dequeueOutbox(clientId: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await db.delete('outbox', clientId);
}

export async function readOutbox(): Promise<OutboxEntry[]> {
  const db = await openCacheDb();
  if (!db) return [];

  return await db.getAllFromIndex('outbox', 'byCreatedAt');
}

export async function bumpAttempts(clientId: string): Promise<number> {
  const db = await openCacheDb();
  if (!db) return 0;

  const entry = await db.get('outbox', clientId);
  if (!entry) return 0;

  const attempts = entry.attempts + 1;
  await db.put('outbox', { ...entry, attempts });
  return attempts;
}

export function outboxAttachmentToFile(attachment: OutboxAttachment): File {
  return new File([attachment.blob], attachment.fileName, { type: attachment.mimeType });
}
