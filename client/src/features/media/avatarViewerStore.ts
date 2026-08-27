import { create } from 'zustand';

interface AvatarViewerState {
  url: string | null;
  label: string;
  open: (url: string, label: string) => void;
  close: () => void;
}

export const useAvatarViewerStore = create<AvatarViewerState>((set) => ({
  url: null,
  label: '',

  open(url, label) {
    set({ url, label });
  },

  close() {
    set({ url: null, label: '' });
  },
}));

export function openAvatarViewer(url: string, label: string): void {
  useAvatarViewerStore.getState().open(url, label);
}
