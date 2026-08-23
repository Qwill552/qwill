import { create } from 'zustand';

const STORAGE_KEY = 'messenger.desktopListWidth';

export const DESKTOP_LIST_WIDTH_DEFAULT = 460;
export const DESKTOP_LIST_WIDTH_MIN = 360;
export const DESKTOP_LIST_WIDTH_MAX = 560;
export const DESKTOP_CHAT_MIN_WIDTH = 480;

export function clampDesktopListWidth(px: number, maxWidth = DESKTOP_LIST_WIDTH_MAX): number {
  const upper = Math.max(DESKTOP_LIST_WIDTH_MIN, Math.min(DESKTOP_LIST_WIDTH_MAX, maxWidth));
  return Math.min(upper, Math.max(DESKTOP_LIST_WIDTH_MIN, Math.round(px)));
}

export function applyDesktopListWidth(px: number): void {
  document.documentElement.style.setProperty('--desktop-list-w', `${px}px`);
}

function readStored(): number {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampDesktopListWidth(stored) : DESKTOP_LIST_WIDTH_DEFAULT;
}

interface DesktopColumnsState {
  listWidth: number;
  setListWidth: (px: number) => void;
}

export const useDesktopColumnsStore = create<DesktopColumnsState>((set) => ({
  listWidth: readStored(),
  setListWidth(px) {
    const width = clampDesktopListWidth(px);
    localStorage.setItem(STORAGE_KEY, String(width));
    applyDesktopListWidth(width);
    set({ listWidth: width });
  },
}));
