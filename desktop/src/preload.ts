import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const SCREEN_SOURCES_CHANNEL = 'qwill:screen-sources';
const SCREEN_SOURCE_CHOSEN_CHANNEL = 'qwill:screen-source-chosen';
const UPDATER_STATE_CHANNEL = 'qwill:updater-state';
const UPDATER_CHECK_CHANNEL = 'qwill:updater-check';
const UPDATER_INSTALL_CHANNEL = 'qwill:updater-install';

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
});
