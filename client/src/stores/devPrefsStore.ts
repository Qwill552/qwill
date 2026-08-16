import { create } from 'zustand';

const STORAGE_KEY = 'qwill:call-stats';

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

interface DevPrefsState {
  callStatsOverlayEnabled: boolean;
  setCallStatsOverlayEnabled: (enabled: boolean) => void;
  toggleCallStatsOverlay: () => void;
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
}));
