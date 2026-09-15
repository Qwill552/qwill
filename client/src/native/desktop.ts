export interface DesktopScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
  appIcon: string | null;
}

export interface DesktopScreenSourceRequest {
  requestId: number;
  sources: DesktopScreenSource[];
}

export type DesktopUpdaterState =
  | { phase: 'disabled' }
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'latest' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string };

export interface DesktopUpdaterBridge {
  getState(): Promise<unknown>;
  check(): Promise<void>;
  quitAndInstall(): void;
  onState(handler: (state: unknown) => void): () => void;
}

export interface DesktopBridge {
  isDesktop: true;
  getVersion(): Promise<string>;
  setTitleTheme(theme: 'light' | 'dark'): Promise<void>;
  ensureDesktopWidth?(): Promise<void>;
  onScreenSourceRequest?(handler: (request: unknown) => void): () => void;
  chooseScreenSource?(requestId: number, sourceId: string | null): void;
  updater?: DesktopUpdaterBridge;
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

export function setDesktopTitleTheme(theme: 'light' | 'dark'): void {
  const bridge = desktopBridge();
  if (!bridge) return;
  void bridge.setTitleTheme(theme).catch(() => undefined);
}

export function keepDesktopWidth(minWidth: number): () => void {
  const bridge = desktopBridge();
  if (!bridge?.ensureDesktopWidth) return () => undefined;

  const tooNarrow = window.matchMedia(`(max-width: ${minWidth - 1}px)`);
  const widen = (): void => {
    if (tooNarrow.matches) void bridge.ensureDesktopWidth?.().catch(() => undefined);
  };

  widen();
  tooNarrow.addEventListener('change', widen);
  return () => tooNarrow.removeEventListener('change', widen);
}

function parseScreenSource(raw: unknown): DesktopScreenSource | null {
  const candidate = raw as Partial<DesktopScreenSource> | null;
  if (!candidate || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return null;
  if (typeof candidate.thumbnail !== 'string') return null;
  return {
    id: candidate.id,
    name: candidate.name,
    kind: candidate.kind === 'screen' ? 'screen' : 'window',
    thumbnail: candidate.thumbnail,
    appIcon: typeof candidate.appIcon === 'string' ? candidate.appIcon : null,
  };
}

function parseScreenSourceRequest(raw: unknown): DesktopScreenSourceRequest | null {
  const candidate = raw as { requestId?: unknown; sources?: unknown } | null;
  if (!candidate || typeof candidate.requestId !== 'number' || !Array.isArray(candidate.sources)) return null;
  const sources = candidate.sources.map(parseScreenSource).filter((source): source is DesktopScreenSource => source !== null);
  return { requestId: candidate.requestId, sources };
}

export function subscribeToScreenSourceRequests(handler: (request: DesktopScreenSourceRequest) => void): () => void {
  const bridge = desktopBridge();
  if (!bridge?.onScreenSourceRequest) return () => undefined;
  return bridge.onScreenSourceRequest((raw) => {
    const request = parseScreenSourceRequest(raw);
    if (request) handler(request);
  });
}

export function chooseDesktopScreenSource(requestId: number, sourceId: string | null): void {
  desktopBridge()?.chooseScreenSource?.(requestId, sourceId);
}

function parseUpdaterState(raw: unknown): DesktopUpdaterState | null {
  const candidate = raw as { phase?: unknown; version?: unknown; percent?: unknown; message?: unknown } | null;
  if (!candidate || typeof candidate.phase !== 'string') return null;

  switch (candidate.phase) {
    case 'disabled':
    case 'idle':
    case 'checking':
    case 'latest':
      return { phase: candidate.phase };
    case 'ready':
      return typeof candidate.version === 'string' ? { phase: 'ready', version: candidate.version } : null;
    case 'downloading':
      return typeof candidate.version === 'string'
        ? {
            phase: 'downloading',
            version: candidate.version,
            percent: typeof candidate.percent === 'number' ? candidate.percent : 0,
          }
        : null;
    case 'error':
      return {
        phase: 'error',
        message: typeof candidate.message === 'string' ? candidate.message : 'Не удалось проверить обновление',
      };
    default:
      return null;
  }
}

export function isDesktopUpdaterAvailable(): boolean {
  return desktopBridge()?.updater !== undefined;
}

export function getDesktopUpdaterState(): Promise<DesktopUpdaterState | null> {
  const updater = desktopBridge()?.updater;
  if (!updater) return Promise.resolve(null);
  return updater
    .getState()
    .then(parseUpdaterState)
    .catch(() => null);
}

export function subscribeToDesktopUpdater(handler: (state: DesktopUpdaterState) => void): () => void {
  const updater = desktopBridge()?.updater;
  if (!updater) return () => undefined;
  return updater.onState((raw) => {
    const state = parseUpdaterState(raw);
    if (state) handler(state);
  });
}

export function checkDesktopUpdate(): void {
  void desktopBridge()?.updater?.check().catch(() => undefined);
}

export function installDesktopUpdate(): void {
  desktopBridge()?.updater?.quitAndInstall();
}
