/**
 * Абстракция онлайн-статуса — интерфейс + in-memory реализация (секция 3).
 * При переезде на несколько процессов меняется только реализация (Redis), хендлеры не трогаются.
 */
export interface PresenceStore {
  /** Регистрирует сокет пользователя (видимым по умолчанию), возвращает число открытых сокетов после добавления. */
  addSocket(userId: string, socketId: string): number;
  /** Снимает сокет пользователя, возвращает число открытых сокетов после удаления. */
  removeSocket(userId: string, socketId: string): number;
  /** Клиент сообщил о смене видимости вкладки (Page Visibility API) — влияет только на hasVisibleClient. */
  setVisibility(userId: string, socketId: string, visible: boolean): void;
  isOnline(userId: string): boolean;
  /** Есть ли у пользователя хоть один сокет с видимой вкладкой — критерий для push (сокет жив в фоне, но пуш всё равно нужен). */
  hasVisibleClient(userId: string): boolean;
}

class InMemoryPresenceStore implements PresenceStore {
  private readonly socketsByUser = new Map<string, Map<string, boolean>>();

  addSocket(userId: string, socketId: string): number {
    let sockets = this.socketsByUser.get(userId);
    if (!sockets) {
      sockets = new Map();
      this.socketsByUser.set(userId, sockets);
    }
    sockets.set(socketId, true);
    return sockets.size;
  }

  removeSocket(userId: string, socketId: string): number {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return 0;

    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
      return 0;
    }
    return sockets.size;
  }

  setVisibility(userId: string, socketId: string, visible: boolean): void {
    this.socketsByUser.get(userId)?.set(socketId, visible);
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  hasVisibleClient(userId: string): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return false;
    for (const visible of sockets.values()) {
      if (visible) return true;
    }
    return false;
  }
}

export const presenceStore: PresenceStore = new InMemoryPresenceStore();
