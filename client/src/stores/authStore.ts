import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@messenger/shared';
import { create } from 'zustand';

import { loginRequest, logoutRequest, refreshRequest, registerRequest } from '../api/auth';
import { setAccessToken, setRefreshHandler } from '../api/client';
import { connectSocket, disconnectSocket } from '../realtime/socket';
import { useChatStore } from './chatStore';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  user: PublicUser | null;
  status: AuthStatus;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Вызывается один раз при старте приложения — восстанавливает сессию по refresh-куке. */
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  // React StrictMode вызывает эффект монтирования дважды в dev — без дедупликации это
  // означало два параллельных /auth/refresh с одним и тем же токеном (секция 3, этап 2).
  let bootstrapPromise: Promise<void> | null = null;

  function applyAuth(response: AuthResponse): void {
    setAccessToken(response.accessToken);
    set({ user: response.user, status: 'authenticated' });
    // Сокет — единственное соединение на вкладку; переподключается со свежим токеном при логине/рефреше (секция 4).
    connectSocket(response.accessToken);
    useChatStore.getState().subscribeToSocket(response.user.id);
  }

  function clearAuth(): void {
    setAccessToken(null);
    disconnectSocket();
    useChatStore.getState().reset();
    set({ user: null, status: 'anonymous' });
  }

  setRefreshHandler(async () => {
    try {
      applyAuth(await refreshRequest());
      return true;
    } catch {
      clearAuth();
      return false;
    }
  });

  return {
    user: null,
    status: 'idle',

    async register(input) {
      applyAuth(await registerRequest(input));
    },

    async login(input) {
      applyAuth(await loginRequest(input));
    },

    async logout() {
      await logoutRequest().catch(() => undefined);
      clearAuth();
    },

    bootstrap() {
      if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
          set({ status: 'loading' });
          try {
            applyAuth(await refreshRequest());
          } catch {
            clearAuth();
          }
        })();
      }
      return bootstrapPromise;
    },
  };
});
