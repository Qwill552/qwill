import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const SCREEN_SOURCES_CHANNEL = 'qwill:screen-sources';
const SCREEN_SOURCE_CHOSEN_CHANNEL = 'qwill:screen-source-chosen';
const UPDATER_STATE_CHANNEL = 'qwill:updater-state';
const UPDATER_CHECK_CHANNEL = 'qwill:updater-check';
const UPDATER_INSTALL_CHANNEL = 'qwill:updater-install';
const NOTIFY_CHANNEL = 'qwill:notify';
const BADGE_CHANNEL = 'qwill:set-badge-count';
const AUTOSTART_GET_CHANNEL = 'qwill:autostart-get';
const AUTOSTART_SET_CHANNEL = 'qwill:autostart-set';
const DEEP_LINK_CHANNEL = 'qwill:deep-link';
const DEEP_LINK_PENDING_CHANNEL = 'qwill:deep-link-pending';

contextBridge.exposeInMainWorld('qwill', {
  isDesktop: true,
  getVersion: (): Promise<string> => ipcRenderer.invoke('qwill:app-version') as Promise<string>,
  setTitleTheme: (theme: 'light' | 'dark'): Promise<void> =>
    ipcRenderer.invoke('qwill:set-title-theme', theme) as Promise<void>,
  ensureDesktopWidth: (): Promise<void> =>
    ipcRenderer.invoke('qwill:ensure-desktop-width') as Promise<void>,
  onScreenSourceRequest: (handler: (request: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, request: unknown): void => handler(request);
    ipcRenderer.on(SCREEN_SOURCES_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(SCREEN_SOURCES_CHANNEL, listener);
    };
  },
  chooseScreenSource: (requestId: number, sourceId: string | null): void => {
    ipcRenderer.send(SCREEN_SOURCE_CHOSEN_CHANNEL, { requestId, sourceId });
  },
  updater: {
    getState: (): Promise<unknown> => ipcRenderer.invoke(UPDATER_STATE_CHANNEL) as Promise<unknown>,
    check: (): Promise<void> => ipcRenderer.invoke(UPDATER_CHECK_CHANNEL) as Promise<void>,
    quitAndInstall: (): void => {
      ipcRenderer.send(UPDATER_INSTALL_CHANNEL);
    },
    onState: (handler: (state: unknown) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, state: unknown): void => handler(state);
      ipcRenderer.on(UPDATER_STATE_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(UPDATER_STATE_CHANNEL, listener);
      };
    },
  },
  notify: (payload: unknown): void => {
    ipcRenderer.send(NOTIFY_CHANNEL, payload);
  },
  setBadgeCount: (count: number): void => {
    ipcRenderer.send(BADGE_CHANNEL, count);
  },
  autostart: {
    get: (): Promise<boolean> => ipcRenderer.invoke(AUTOSTART_GET_CHANNEL) as Promise<boolean>,
    set: (enabled: boolean): Promise<void> => ipcRenderer.invoke(AUTOSTART_SET_CHANNEL, enabled) as Promise<void>,
  },
  onDeepLink: (handler: (target: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, target: unknown): void => handler(target);
    ipcRenderer.on(DEEP_LINK_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(DEEP_LINK_CHANNEL, listener);
    };
  },
  getPendingDeepLink: (): Promise<unknown> => ipcRenderer.invoke(DEEP_LINK_PENDING_CHANNEL),
});
