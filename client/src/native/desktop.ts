export interface DesktopBridge {
  isDesktop: true;
  getVersion(): Promise<string>;
}

declare global {
  interface Window {
    qwill?: DesktopBridge;
  }
}

function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.qwill?.isDesktop === true ? window.qwill : null;
}

export function isDesktopShell(): boolean {
  return desktopBridge() !== null;
}

export function getDesktopVersion(): Promise<string | null> {
  const bridge = desktopBridge();
  if (!bridge) return Promise.resolve(null);
  return bridge.getVersion().catch(() => null);
}
