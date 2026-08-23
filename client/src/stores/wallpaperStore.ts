import { create } from 'zustand';

import { DEFAULT_WALLPAPER_PATTERN_ID, wallpaperPatternById } from '../features/chat/wallpaperPatterns';

const STORAGE_KEY = 'qwill:chat-pattern';

function readStored(): string {
  try {
    return wallpaperPatternById(localStorage.getItem(STORAGE_KEY) ?? DEFAULT_WALLPAPER_PATTERN_ID).id;
  } catch {
    return DEFAULT_WALLPAPER_PATTERN_ID;
  }
}

function writeStored(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    return;
  }
}

interface WallpaperState {
  patternId: string;
  setPatternId: (id: string) => void;
}

export const useWallpaperStore = create<WallpaperState>((set) => ({
  patternId: readStored(),
  setPatternId(id) {
    const resolved = wallpaperPatternById(id).id;
    writeStored(resolved);
    set({ patternId: resolved });
  },
}));
