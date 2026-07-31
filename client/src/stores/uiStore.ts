import type { FontSize, SurfaceMode, ThemePreference, UserSettingsDTO } from '@messenger/shared';
import { create } from 'zustand';

import { updateSettingsRequest } from '../api/users';

const THEME_KEY = 'messenger.theme';
const FONT_SIZE_KEY = 'messenger.fontSize';
const SURFACE_KEY = 'messenger.surface';

/** Значения должны совпадать с --bg в tokens.css и с таблицей в инлайн-скрипте index.html. */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#f6f4fb',
  dark: '#131020',
};

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

function readStoredSurface(): SurfaceMode {
  const stored = localStorage.getItem(SURFACE_KEY);
  return stored === 'glass' || stored === 'solid' ? stored : 'glass';
}

/** Цвет системной строки браузера следует за темой — иначе на мобильном остаётся полоса чужого цвета. */
function applyThemeColor(resolved: 'light' | 'dark'): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
}

function applyTheme(preference: ThemePreference): 'light' | 'dark' {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  applyThemeColor(resolved);
  localStorage.setItem(THEME_KEY, preference);
  return resolved;
}

function applyFontSize(fontSize: FontSize): void {
  document.documentElement.dataset.fontSize = fontSize;
  localStorage.setItem(FONT_SIZE_KEY, fontSize);
}

function applySurface(surface: SurfaceMode): void {
  document.documentElement.dataset.surface = surface;
  localStorage.setItem(SURFACE_KEY, surface);
}

interface UiState {
  /** Разрешённое значение (light/dark) — то, что реально нарисовано; для иконки и CSS. */
  theme: 'light' | 'dark';
  /** Сырое предпочтение (может быть 'system') — то, что показывает панель настроек. */
  themePreference: ThemePreference;
  fontSize: FontSize;
  /** Режим оформления: Стекло или Строгий. Ортогонален теме (UI-1). */
  surface: SurfaceMode;
  /** Быстрое переключение light↔dark из шапки — существовало до этапа 8, поведение не меняется. */
  toggleTheme: () => void;
  setThemePreference: (preference: ThemePreference) => void;
  setFontSize: (fontSize: FontSize) => void;
  setSurface: (surface: SurfaceMode) => void;
  /** Настройки, пришедшие с сервера при логине/бутстрапе — применяются без повторного PATCH (этап 8). */
  hydrateFromServer: (settings: UserSettingsDTO) => void;
}

/** Тема и оформление уже применены инлайн-скриптом в index.html до первого кадра — здесь синхронизация
 *  состояния и сохранение предпочтений на сервере, чтобы они не терялись при входе с другого устройства (этап 8). */
export const useUiStore = create<UiState>((set, get) => {
  function persist(patch: { theme?: ThemePreference; fontSize?: FontSize; surface?: SurfaceMode }): void {
    updateSettingsRequest(patch).catch(() => undefined);
  }

  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().themePreference !== 'system') return;
      const resolved = systemTheme();
      document.documentElement.dataset.theme = resolved;
      applyThemeColor(resolved);
      set({ theme: resolved });
    });
  }

  const initialPreference = readStoredPreference();

  return {
    theme: (document.documentElement.dataset.theme as 'light' | 'dark' | undefined) ?? resolveTheme(initialPreference),
    themePreference: initialPreference,
    fontSize: readStoredFontSize(),
    surface: (document.documentElement.dataset.surface as SurfaceMode | undefined) ?? readStoredSurface(),

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

    setSurface(surface) {
      applySurface(surface);
      set({ surface });
      persist({ surface });
    },

    hydrateFromServer(settings) {
      const resolved = applyTheme(settings.theme);
      applyFontSize(settings.fontSize);
      applySurface(settings.surface);
      set({
        theme: resolved,
        themePreference: settings.theme,
        fontSize: settings.fontSize,
        surface: settings.surface,
      });
    },
  };
});
