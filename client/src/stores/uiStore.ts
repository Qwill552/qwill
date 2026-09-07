import type { FontSize, ThemePreference, UserSettingsDTO } from '@messenger/shared';
import { create } from 'zustand';

import { hasSessionCredentials } from '../api/client';
import { updateSettingsRequest } from '../api/users';
import { setCallBackgroundStyle, type CallBackgroundStyle } from '../calls/nativeCall';
import { setDesktopTitleTheme } from '../native/desktop';

const THEME_KEY = 'messenger.theme';
const FONT_SIZE_KEY = 'messenger.fontSize';
const CALL_BACKGROUND_KEY = 'messenger.callBackground';

/** Значения должны совпадать с --bg в tokens.css и с таблицей в инлайн-скрипте index.html. */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#eef1f6',
  dark: '#0a0c12',
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

function readStoredCallBackground(): CallBackgroundStyle {
  const stored = localStorage.getItem(CALL_BACKGROUND_KEY);
  return stored === 'glow' || stored === 'blobs' ? stored : 'glow';
}

/** Цвет системной строки браузера следует за темой — иначе на мобильном остаётся полоса чужого цвета. */
function applyThemeColor(resolved: 'light' | 'dark'): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
}

/** Чтение геометрии заставляет браузер пересчитать стиль немедленно — без этого атрибут
 *  ниже снялся бы до того, как новая тема попала в хоть один пересчёт, и глушение переходов
 *  не сработало бы вовсе. */
function forceStyleFlush(element: HTMLElement): number {
  return element.offsetWidth;
}

/**
 * Единственная точка, где тема попадает на <html>. Атрибут `data-theme-swap` на время
 * подмены глушит все CSS-переходы (tokens.css) — иначе элементы со своим `transition` на
 * цвет или фон (вкладки списка, разделитель колонок, иконки композера) доезжали бы до нового
 * цвета уже после кругового раскрытия темы, а не вместе с ним (ux-ui.md, этап 14, шаг 4).
 * Ставится и снимается в одной задаче вокруг принудительного пересчёта стиля, поэтому
 * наведение и нажатие свои переходы сохраняют.
 */
export function setThemeAttribute(resolved: 'light' | 'dark'): void {
  const html = document.documentElement;
  html.dataset.themeSwap = '';
  html.dataset.theme = resolved;
  forceStyleFlush(html);
  delete html.dataset.themeSwap;
}

function applyTheme(preference: ThemePreference): 'light' | 'dark' {
  const resolved = resolveTheme(preference);
  setThemeAttribute(resolved);
  applyThemeColor(resolved);
  setDesktopTitleTheme(resolved);
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
  callBackground: CallBackgroundStyle;
  /** Быстрое переключение light↔dark из шапки — существовало до этапа 8, поведение не меняется. */
  toggleTheme: () => void;
  setThemePreference: (preference: ThemePreference) => void;
  setFontSize: (fontSize: FontSize) => void;
  setCallBackground: (style: CallBackgroundStyle) => void;
  /** Настройки, пришедшие с сервера при логине/бутстрапе — применяются без повторного PATCH (этап 8). */
  hydrateFromServer: (settings: UserSettingsDTO) => void;
}

/** Тема уже применена инлайн-скриптом в index.html до первого кадра — здесь синхронизация
 *  состояния и сохранение предпочтений на сервере, чтобы они не терялись при входе с другого устройства (этап 8). */
export const useUiStore = create<UiState>((set, get) => {
  function persist(patch: { theme?: ThemePreference; fontSize?: FontSize }): void {
    if (!hasSessionCredentials()) return;
    updateSettingsRequest(patch).catch(() => undefined);
  }

  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().themePreference !== 'system') return;
      const resolved = systemTheme();
      setThemeAttribute(resolved);
      applyThemeColor(resolved);
      setDesktopTitleTheme(resolved);
      set({ theme: resolved });
    });
  }

  const initialPreference = readStoredPreference();
  const initialTheme =
    (document.documentElement.dataset.theme as 'light' | 'dark' | undefined) ?? resolveTheme(initialPreference);
  setDesktopTitleTheme(initialTheme);

  return {
    theme: initialTheme,
    themePreference: initialPreference,
    fontSize: readStoredFontSize(),
    callBackground: readStoredCallBackground(),

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

    setCallBackground(style) {
      localStorage.setItem(CALL_BACKGROUND_KEY, style);
      set({ callBackground: style });
      void setCallBackgroundStyle(style);
    },

    hydrateFromServer(settings) {
      const resolved = applyTheme(settings.theme);
      applyFontSize(settings.fontSize);
      set({
        theme: resolved,
        themePreference: settings.theme,
        fontSize: settings.fontSize,
      });
    },
  };
});
