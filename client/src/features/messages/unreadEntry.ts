export interface UnreadMessage {
  id: number;
  sender: { id: string } | null;
}

export type UnreadEntry =
  | { kind: 'none' }
  | { kind: 'anchor'; messageId: number }
  | { kind: 'load'; after: number };

export function firstUnreadAfter(messages: UnreadMessage[], cursor: number, myId: string | null): number | null {
  for (const message of messages) {
    if (message.id <= cursor) continue;
    if (message.sender?.id === myId) continue;
    return message.id;
  }
  return null;
}

export function decideUnreadEntry(
  messages: UnreadMessage[],
  hasMoreBefore: boolean,
  unreadCount: number,
  cursor: number,
  myId: string | null,
): UnreadEntry {
  if (unreadCount <= 0) return { kind: 'none' };
  const settled = messages.filter((message) => message.id > 0);
  const newest = settled[settled.length - 1]?.id;
  if (newest !== undefined && cursor >= newest) return { kind: 'none' };
  const oldest = settled[0]?.id;
  if (oldest !== undefined && (oldest <= cursor || !hasMoreBefore)) {
    const anchor = firstUnreadAfter(settled, cursor, myId);
    return anchor === null ? { kind: 'none' } : { kind: 'anchor', messageId: anchor };
  }
  return { kind: 'load', after: cursor };
}

export function unreadBetween(messages: UnreadMessage[], myId: string | null, fromExclusive: number, toInclusive: number): number {
  let count = 0;
  for (const message of messages) {
    if (message.id <= fromExclusive || message.id > toInclusive) continue;
    if (message.sender?.id === myId) continue;
    count += 1;
  }
  return count;
}

export const READ_MIN_INTERVAL_MS = 500;

export interface ReadTrackerTimers {
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
}

export class ReadTracker {
  private sent = 0;
  private pending = 0;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private timer: number | null = null;

  constructor(
    private readonly send: (messageId: number) => void,
    private readonly timers: ReadTrackerTimers,
  ) {}

  get cursor(): number {
    return Math.max(this.sent, this.pending);
  }

  know(serverCursor: number | null | undefined): void {
    if (serverCursor === null || serverCursor === undefined) return;
    if (serverCursor > this.sent) this.sent = serverCursor;
    if (this.pending <= this.sent) this.pending = 0;
  }

  seen(messageId: number): boolean {
    if (messageId <= 0 || messageId <= this.cursor) return false;
    this.pending = messageId;
    const wait = this.lastSentAt + READ_MIN_INTERVAL_MS - this.timers.now();
    if (wait <= 0) this.flush();
    else if (this.timer === null) {
      this.timer = this.timers.setTimeout(() => {
        this.timer = null;
        this.flush();
      }, wait);
    }
    return true;
  }

  flush(): void {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending <= this.sent) return;
    this.sent = this.pending;
    this.pending = 0;
    this.lastSentAt = this.timers.now();
    this.send(this.sent);
  }

  reset(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.sent = 0;
    this.pending = 0;
    this.lastSentAt = Number.NEGATIVE_INFINITY;
  }
}
