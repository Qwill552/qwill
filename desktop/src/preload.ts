import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const SCREEN_SOURCES_CHANNEL = 'qwill:screen-sources';
const SCREEN_SOURCE_CHOSEN_CHANNEL = 'qwill:screen-source-chosen';

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
});
