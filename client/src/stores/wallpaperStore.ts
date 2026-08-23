import { create } from 'zustand';

import { DEFAULT_WALLPAPER_GRADIENT_ID, wallpaperGradientById } from '../features/chat/wallpaperGradients';
import { DEFAULT_WALLPAPER_PATTERN_ID, wallpaperPatternById } from '../features/chat/wallpaperPatterns';

const PATTERN_KEY = 'qwill:chat-pattern';
const GRADIENT_KEY = 'qwill:chat-gradient';

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

interface WallpaperState {
  patternId: string;
  gradientId: string;
  setPatternId: (id: string) => void;
  setGradientId: (id: string) => void;
}

export const useWallpaperStore = create<WallpaperState>((set) => ({
  patternId: wallpaperPatternById(read(PATTERN_KEY, DEFAULT_WALLPAPER_PATTERN_ID)).id,
  gradientId: wallpaperGradientById(read(GRADIENT_KEY, DEFAULT_WALLPAPER_GRADIENT_ID)).id,
  setPatternId(id) {
    const resolved = wallpaperPatternById(id).id;
    write(PATTERN_KEY, resolved);
    set({ patternId: resolved });
  },
  setGradientId(id) {
    const resolved = wallpaperGradientById(id).id;
    write(GRADIENT_KEY, resolved);
    set({ gradientId: resolved });
  },
}));
