import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@messenger/shared';
import { create } from 'zustand';

import { loginRequest, logoutRequest, refreshRequest, registerRequest } from '../api/auth';
import { setAccessToken, setRefreshHandler } from '../api/client';

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
  function applyAuth(response: AuthResponse): void {
    setAccessToken(response.accessToken);
    set({ user: response.user, status: 'authenticated' });
  }

  function clearAuth(): void {
    setAccessToken(null);
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

    async bootstrap() {
      set({ status: 'loading' });
      try {
        applyAuth(await refreshRequest());
      } catch {
        clearAuth();
      }
    },
  };
});
