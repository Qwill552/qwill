import { create } from 'zustand';

import type { ScreenShareChangeMode } from '../calls/types';

const STORAGE_KEY = 'qwill:call-stats';
const SCREEN_SHARE_MODE_KEY = 'qwill:screen-share-change-mode';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    return;
  }
}

function readStoredScreenShareChangeMode(): ScreenShareChangeMode {
  try {
    return localStorage.getItem(SCREEN_SHARE_MODE_KEY) === 'republish' ? 'republish' : 'replace';
  } catch {
    return 'replace';
  }
}

function writeStoredScreenShareChangeMode(mode: ScreenShareChangeMode): void {
  try {
    localStorage.setItem(SCREEN_SHARE_MODE_KEY, mode);
  } catch {
    return;
  }
}

interface DevPrefsState {
  callStatsOverlayEnabled: boolean;
  setCallStatsOverlayEnabled: (enabled: boolean) => void;
  toggleCallStatsOverlay: () => void;
  screenShareChangeMode: ScreenShareChangeMode;
  setScreenShareChangeMode: (mode: ScreenShareChangeMode) => void;
}

export const useDevPrefsStore = create<DevPrefsState>((set, get) => ({
  callStatsOverlayEnabled: readStored(),
  setCallStatsOverlayEnabled(enabled) {
    writeStored(enabled);
    set({ callStatsOverlayEnabled: enabled });
  },
  toggleCallStatsOverlay() {
    get().setCallStatsOverlayEnabled(!get().callStatsOverlayEnabled);
  },
  screenShareChangeMode: readStoredScreenShareChangeMode(),
  setScreenShareChangeMode(mode) {
    writeStoredScreenShareChangeMode(mode);
    set({ screenShareChangeMode: mode });
  },
}));
