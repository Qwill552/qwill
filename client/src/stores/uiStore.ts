import type { FontSize, ThemePreference, UserSettingsDTO } from '@messenger/shared';
import { create } from 'zustand';

import { updateSettingsRequest } from '../api/users';

const THEME_KEY = 'messenger.theme';
const FONT_SIZE_KEY = 'messenger.fontSize';

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  return preference === 'system' ? systemTheme() : preference;
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function readStoredFontSize(): FontSize {
  const stored = localStorage.getItem(FONT_SIZE_KEY);
  return stored === 'small' || stored === 'medium' || stored === 'large' ? stored : 'medium';
}

function applyTheme(preference: ThemePreference): 'light' | 'dark' {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem(THEME_KEY, preference);
  return resolved;
}

function applyFontSize(fontSize: FontSize): void {
  document.documentElement.dataset.fontSize = fontSize;
  localStorage.setItem(FONT_SIZE_KEY, fontSize);
}

interface UiState {
  /** Разрешённое значение (light/dark) — то, что реально нарисовано; для иконки и CSS. */
  theme: 'light' | 'dark';
  /** Сырое предпочтение (может быть 'system') — то, что показывает панель настроек. */
  themePreference: ThemePreference;
  fontSize: FontSize;
  /** Быстрое переключение light↔dark из шапки — существовало до этапа 8, поведение не меняется. */
  toggleTheme: () => void;
  setThemePreference: (preference: ThemePreference) => void;
  setFontSize: (fontSize: FontSize) => void;
  /** Настройки, пришедшие с сервера при логине/бутстрапе — применяются без повторного PATCH (этап 8). */
  hydrateFromServer: (settings: UserSettingsDTO) => void;
}

/** Тема уже применена инлайн-скриптом в index.html до первого кадра (секция 4) — здесь синхронизация
 *  состояния и сохранение предпочтений на сервере, чтобы они не терялись при входе с другого устройства (этап 8). */
export const useUiStore = create<UiState>((set, get) => {
  function persist(patch: { theme?: ThemePreference; fontSize?: FontSize }): void {
    updateSettingsRequest(patch).catch(() => undefined);
  }

  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().themePreference !== 'system') return;
      const resolved = systemTheme();
      document.documentElement.dataset.theme = resolved;
      set({ theme: resolved });
    });
  }

  const initialPreference = readStoredPreference();

  return {
    theme: (document.documentElement.dataset.theme as 'light' | 'dark' | undefined) ?? resolveTheme(initialPreference),
    themePreference: initialPreference,
    fontSize: readStoredFontSize(),

    toggleTheme() {
      const next: ThemePreference = get().theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      set({ theme: next, themePreference: next });
      persist({ theme: next });
    },

    setThemePreference(preference) {
      const resolved = applyTheme(preference);
      set({ theme: resolved, themePreference: preference });
      persist({ theme: preference });
    },

    setFontSize(fontSize) {
      applyFontSize(fontSize);
      set({ fontSize });
      persist({ fontSize });
    },

    hydrateFromServer(settings) {
      const resolved = applyTheme(settings.theme);
      applyFontSize(settings.fontSize);
      set({ theme: resolved, themePreference: settings.theme, fontSize: settings.fontSize });
    },
  };
});
