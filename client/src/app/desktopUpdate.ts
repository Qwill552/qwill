import { create } from 'zustand';

import {
  checkDesktopUpdate,
  getDesktopAutoUpdate,
  getDesktopUpdaterState,
  getDesktopVersion,
  installDesktopUpdate,
  isDesktopUpdaterAvailable,
  setDesktopAutoUpdate,
  subscribeToDesktopUpdater,
  type DesktopUpdaterState,
} from '../native/desktop';

interface DesktopUpdateState {
  state: DesktopUpdaterState;
  currentVersion: string | null;
  autoUpdate: boolean;
  init: () => () => void;
  check: () => void;
  install: () => void;
  setAutoUpdate: (enabled: boolean) => void;
}

export const useDesktopUpdateStore = create<DesktopUpdateState>((set) => ({
  state: { phase: 'disabled' },
  currentVersion: null,
  autoUpdate: true,

  init: () => {
    void getDesktopVersion().then((currentVersion) => set({ currentVersion }));
    if (!isDesktopUpdaterAvailable()) return () => undefined;

    void getDesktopUpdaterState().then((state) => {
      if (state) set({ state });
    });
    void getDesktopAutoUpdate().then((autoUpdate) => set({ autoUpdate }));

    return subscribeToDesktopUpdater((state) => set({ state }));
  },

  check: () => checkDesktopUpdate(),
  install: () => installDesktopUpdate(),

  setAutoUpdate: (enabled) => {
    set({ autoUpdate: enabled });
    setDesktopAutoUpdate(enabled);
  },
}));
