import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'messenger.theme';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

interface UiState {
  theme: Theme;
  toggleTheme: () => void;
}

/** Тема уже применена инлайн-скриптом в index.html до первого кадра (секция 4) — здесь только синхронизация. */
export const useUiStore = create<UiState>((set, get) => ({
  theme: (document.documentElement.dataset.theme as Theme | undefined) ?? systemTheme(),
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
}));
