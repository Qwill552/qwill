import { useSyncExternalStore } from 'react';

export const DESKTOP_MIN_WIDTH = 900;

export type LayoutMode = 'mobile' | 'desktop';

const desktopQuery = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);

function subscribe(onChange: () => void): () => void {
  desktopQuery.addEventListener('change', onChange);
  return () => desktopQuery.removeEventListener('change', onChange);
}

export function isDesktopViewport(): boolean {
  return desktopQuery.matches;
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, isDesktopViewport, () => false) ? 'desktop' : 'mobile';
}
