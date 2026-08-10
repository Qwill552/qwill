import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@messenger/shared';
import { create } from 'zustand';

import { loginRequest, logoutRequest, refreshRequest, registerRequest } from '../api/auth';
import { NetworkError, setAccessToken, setRefreshHandler } from '../api/client';
import { getSettingsRequest } from '../api/users';
import { clearAllCache } from '../cache/db';
import { clearOfflineProfile, readOfflineProfile, saveOfflineProfile } from '../cache/offlineProfile';
import { subscribeToPush, unsubscribePush } from '../realtime/push';
import { connectSocket, disconnectSocket } from '../realtime/socket';
import { useChatStore } from './chatStore';
import { useUiStore } from './uiStore';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  user: PublicUser | null;
  status: AuthStatus;
  /** true — сессия восстановлена из локального мини-профиля без сети, ещё не подтверждена сервером. */
  isOfflineSession: boolean;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Вызывается один раз при старте приложения — восстанавливает сессию по refresh-куке. */
  bootstrap: () => Promise<void>;
  /** Вызывается при возврате сети, если сессия восстановлена офлайн — тихо дотягивает настоящий refresh. */
  refreshWhenOnline: () => Promise<void>;
  /** Точечное обновление профиля (пока только аватар) без повторного логина. */
  updateUser: (user: PublicUser) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // React StrictMode вызывает эффект монтирования дважды в dev — без дедупликации это
  // означало два параллельных /auth/refresh с одним и тем же токеном (секция 3, этап 2).
  let bootstrapPromise: Promise<void> | null = null;

  function applyAuth(response: AuthResponse): void {
    setAccessToken(response.accessToken);
    set({ user: response.user, status: 'authenticated', isOfflineSession: false });
    saveOfflineProfile(response.user);
    // Сокет — единственное соединение на вкладку; переподключается со свежим токеном при логине/рефреше (секция 4).
    connectSocket(response.accessToken);
    useChatStore.getState().subscribeToSocket(response.user.id);
    // Тема/размер шрифта уже применены локально (localStorage) — подтягиваем серверную версию,
    // чтобы настройки не терялись при входе с другого устройства (этап 8).
    getSettingsRequest()
      .then((settings) => useUiStore.getState().hydrateFromServer(settings))
      .catch(() => undefined);
    // Не блокирует вход — молча пропускается, если разрешение ещё не дано или браузер не умеет (этап 9).
    subscribeToPush().catch(() => undefined);
  }

  async function clearAuth(): Promise<void> {
    setAccessToken(null);
    clearOfflineProfile();
    disconnectSocket();
    await clearAllCache();
    useChatStore.getState().reset();
    set({ user: null, status: 'anonymous', isOfflineSession: false });
    // Иначе следующий пользователь на этом же устройстве получал бы пуши по чужой подписке (этап 9).
    unsubscribePush().catch(() => undefined);
  }

  /** Сеть недоступна — не значит «сессия невалидна» (КЭШ-7): без профиля деться некуда, только тогда на /login. */
  function applyOfflineProfile(): boolean {
    const cached = readOfflineProfile();
    if (!cached) return false;

    set({ user: cached, status: 'authenticated', isOfflineSession: true });
    useChatStore.getState().subscribeToSocket(cached.id);
    return true;
  }

  setRefreshHandler(async () => {
    try {
      applyAuth(await refreshRequest());
      return true;
    } catch (error) {
      if (error instanceof NetworkError && applyOfflineProfile()) return true;
      await clearAuth();
      return false;
    }
  });

  return {
    user: null,
    status: 'idle',
    isOfflineSession: false,

    async register(input) {
      applyAuth(await registerRequest(input));
    },

    async login(input) {
      applyAuth(await loginRequest(input));
    },

    async logout() {
      await logoutRequest().catch(() => undefined);
      await clearAuth();
    },

    bootstrap() {
      if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
          set({ status: 'loading' });
          try {
            applyAuth(await refreshRequest());
          } catch (error) {
            if (error instanceof NetworkError && applyOfflineProfile()) return;
            await clearAuth();
          }
        })();
      }
      return bootstrapPromise;
    },

    async refreshWhenOnline() {
      if (!get().isOfflineSession) return;

      try {
        applyAuth(await refreshRequest());
      } catch (error) {
        if (!(error instanceof NetworkError)) await clearAuth();
      }
    },

    updateUser(user) {
      set({ user });
    },
  };
});

window.addEventListener('online', () => {
  void useAuthStore.getState().refreshWhenOnline();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void useAuthStore.getState().refreshWhenOnline();
});
