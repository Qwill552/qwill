import { create } from 'zustand';

interface QrInviteState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useQrInviteStore = create<QrInviteState>((set) => ({
  open: false,

  show() {
    set({ open: true });
  },

  hide() {
    set({ open: false });
  },
}));

export function openQrInvite(): void {
  useQrInviteStore.getState().show();
}
