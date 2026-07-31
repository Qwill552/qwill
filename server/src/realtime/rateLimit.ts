/**
 * Ограничивает частоту message:send — 30 сообщений за 10 секунд на пользователя (секция 8).
 * In-memory, как presence.ts — при переезде на несколько процессов потребует общего хранилища.
 */
const WINDOW_MS = 10_000;
const MAX_MESSAGES = 30;

class MessageRateLimiter {
  private readonly timestampsByUser = new Map<string, number[]>();

  /** true — можно отправлять, false — лимит исчерпан. */
  tryConsume(userId: string): boolean {
    const now = Date.now();
    const recent = (this.timestampsByUser.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

    if (recent.length >= MAX_MESSAGES) {
      this.timestampsByUser.set(userId, recent);
      return false;
    }

    recent.push(now);
    this.timestampsByUser.set(userId, recent);
    return true;
  }
}

export const messageRateLimiter = new MessageRateLimiter();
