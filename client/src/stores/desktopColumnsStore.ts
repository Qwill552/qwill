import { create } from 'zustand';

const STORAGE_KEY = 'messenger.desktopListWidth';

export const DESKTOP_LIST_WIDTH_DEFAULT = 460;
export const DESKTOP_LIST_WIDTH_MIN = 360;
export const DESKTOP_LIST_WIDTH_BASE_MAX = 560;
export const DESKTOP_LIST_WIDTH_SHARE = 0.4;
export const DESKTOP_CHAT_MIN_WIDTH = 480;

export function maxDesktopListWidth(available: number): number {
  const proportional = Math.max(DESKTOP_LIST_WIDTH_BASE_MAX, available * DESKTOP_LIST_WIDTH_SHARE);
  return Math.max(DESKTOP_LIST_WIDTH_MIN, Math.min(available - DESKTOP_CHAT_MIN_WIDTH, proportional));
}

export function clampDesktopListWidth(px: number, available = window.innerWidth): number {
  return Math.min(maxDesktopListWidth(available), Math.max(DESKTOP_LIST_WIDTH_MIN, Math.round(px)));
}

export function applyDesktopListWidth(px: number): void {
  document.documentElement.style.setProperty('--desktop-list-w', `${px}px`);
}

function readStored(): number {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0
    ? Math.max(DESKTOP_LIST_WIDTH_MIN, Math.round(stored))
    : DESKTOP_LIST_WIDTH_DEFAULT;
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
