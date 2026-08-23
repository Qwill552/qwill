import { useSyncExternalStore } from 'react';

export const DESKTOP_MIN_WIDTH = 1000;

export type LayoutMode = 'mobile' | 'desktop';

const desktopQuery = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);

function subscribe(onChange: () => void): () => void {
  desktopQuery.addEventListener('change', onChange);
  return () => desktopQuery.removeEventListener('change', onChange);
}

function isDesktop(): boolean {
  return desktopQuery.matches;
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, isDesktop, () => false) ? 'desktop' : 'mobile';
}
