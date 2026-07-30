/**
 * Абстракция онлайн-статуса — интерфейс + in-memory реализация (секция 3).
 * При переезде на несколько процессов меняется только реализация (Redis), хендлеры не трогаются.
 */
export interface PresenceStore {
  /** Регистрирует сокет пользователя, возвращает число открытых сокетов после добавления. */
  addSocket(userId: string): number;
  /** Снимает сокет пользователя, возвращает число открытых сокетов после удаления. */
  removeSocket(userId: string): number;
  isOnline(userId: string): boolean;
}

class InMemoryPresenceStore implements PresenceStore {
  private readonly socketCountByUser = new Map<string, number>();

  addSocket(userId: string): number {
    const next = (this.socketCountByUser.get(userId) ?? 0) + 1;
    this.socketCountByUser.set(userId, next);
    return next;
  }

  removeSocket(userId: string): number {
    const next = Math.max(0, (this.socketCountByUser.get(userId) ?? 0) - 1);
    if (next === 0) this.socketCountByUser.delete(userId);
    else this.socketCountByUser.set(userId, next);
    return next;
  }

  isOnline(userId: string): boolean {
    return (this.socketCountByUser.get(userId) ?? 0) > 0;
  }
}

export const presenceStore: PresenceStore = new InMemoryPresenceStore();
