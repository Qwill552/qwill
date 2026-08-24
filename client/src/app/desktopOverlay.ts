import { isDesktopViewport } from './useLayoutMode';

export type DesktopColumn = 'list' | 'chat';

export interface HorizontalSpan {
  left: number;
  right: number;
}

export function desktopColumnRect(column: DesktopColumn): DOMRect | null {
  if (!isDesktopViewport()) return null;
  const element = document.querySelector<HTMLElement>(`[data-desktop-column='${column}']`);
  return element ? element.getBoundingClientRect() : null;
}

export function desktopOverlayBounds(anchor: HorizontalSpan): DOMRect | null {
  if (!isDesktopViewport()) return null;
  const center = (anchor.left + anchor.right) / 2;
  const columns = Array.from(document.querySelectorAll<HTMLElement>('[data-desktop-column]'));
  for (const column of columns) {
    const rect = column.getBoundingClientRect();
    if (center >= rect.left && center <= rect.right) return rect;
  }
  return desktopColumnRect('chat');
}
