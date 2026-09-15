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
  getAuto?(): Promise<boolean>;
  setAuto?(enabled: boolean): Promise<void>;
}

export interface DesktopNotifyPayload {
  title: string;
  body: string;
  chatId: string;
}

export interface DesktopAutostartBridge {
  get(): Promise<boolean>;
  set(enabled: boolean): Promise<void>;
}

export interface DesktopDeepLinkTarget {
  type: 'chat' | 'user';
  id: string;
}

export interface DesktopBridge {
  isDesktop: true;
  getVersion(): Promise<string>;
  setTitleTheme(theme: 'light' | 'dark'): Promise<void>;
  ensureDesktopWidth?(): Promise<void>;
  onScreenSourceRequest?(handler: (request: unknown) => void): () => void;
  chooseScreenSource?(requestId: number, sourceId: string | null): void;
  updater?: DesktopUpdaterBridge;
  notify?(payload: DesktopNotifyPayload): void;
  setBadgeCount?(count: number): void;
  autostart?: DesktopAutostartBridge;
  onDeepLink?(handler: (target: unknown) => void): () => void;
  getPendingDeepLink?(): Promise<unknown>;
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

export function getDesktopAutoUpdate(): Promise<boolean> {
  const updater = desktopBridge()?.updater;
  if (!updater?.getAuto) return Promise.resolve(true);
  return updater.getAuto().catch(() => true);
}

export function setDesktopAutoUpdate(enabled: boolean): void {
  void desktopBridge()?.updater?.setAuto?.(enabled).catch(() => undefined);
}

export function notifyDesktop(payload: DesktopNotifyPayload): void {
  desktopBridge()?.notify?.(payload);
}

export function setDesktopBadgeCount(count: number): void {
  desktopBridge()?.setBadgeCount?.(count);
}

export function isDesktopAutostartAvailable(): boolean {
  return desktopBridge()?.autostart !== undefined;
}

export function getDesktopAutostart(): Promise<boolean> {
  const autostart = desktopBridge()?.autostart;
  if (!autostart) return Promise.resolve(false);
  return autostart.get().catch(() => false);
}

export function setDesktopAutostart(enabled: boolean): void {
  void desktopBridge()?.autostart?.set(enabled).catch(() => undefined);
}

function parseDeepLinkTarget(raw: unknown): DesktopDeepLinkTarget | null {
  const candidate = raw as Partial<DesktopDeepLinkTarget> | null;
  if (!candidate || typeof candidate.id !== 'string') return null;
  if (candidate.type !== 'chat' && candidate.type !== 'user') return null;
  return { type: candidate.type, id: candidate.id };
}

export function subscribeToDesktopDeepLinks(handler: (target: DesktopDeepLinkTarget) => void): () => void {
  const bridge = desktopBridge();
  if (!bridge?.onDeepLink) return () => undefined;
  return bridge.onDeepLink((raw) => {
    const target = parseDeepLinkTarget(raw);
    if (target) handler(target);
  });
}

export function getPendingDesktopDeepLink(): Promise<DesktopDeepLinkTarget | null> {
  const bridge = desktopBridge();
  if (!bridge?.getPendingDeepLink) return Promise.resolve(null);
  return bridge
    .getPendingDeepLink()
    .then(parseDeepLinkTarget)
    .catch(() => null);
}
