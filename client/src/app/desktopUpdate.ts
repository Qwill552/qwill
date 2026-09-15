import { create } from 'zustand';

import {
  checkDesktopUpdate,
  getDesktopUpdaterState,
  getDesktopVersion,
  installDesktopUpdate,
  isDesktopUpdaterAvailable,
  subscribeToDesktopUpdater,
  type DesktopUpdaterState,
} from '../native/desktop';

interface DesktopUpdateState {
  state: DesktopUpdaterState;
  currentVersion: string | null;
  init: () => () => void;
  check: () => void;
  install: () => void;
}

export const useDesktopUpdateStore = create<DesktopUpdateState>((set) => ({
  state: { phase: 'disabled' },
  currentVersion: null,

  init: () => {
    void getDesktopVersion().then((currentVersion) => set({ currentVersion }));
    if (!isDesktopUpdaterAvailable()) return () => undefined;

    void getDesktopUpdaterState().then((state) => {
      if (state) set({ state });
    });

    return subscribeToDesktopUpdater((state) => set({ state }));
  },

  check: () => checkDesktopUpdate(),
  install: () => installDesktopUpdate(),
}));
