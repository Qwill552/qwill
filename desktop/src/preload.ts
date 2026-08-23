import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('qwill', {
  isDesktop: true,
  getVersion: (): Promise<string> => ipcRenderer.invoke('qwill:app-version') as Promise<string>,
  setTitleTheme: (theme: 'light' | 'dark'): Promise<void> =>
    ipcRenderer.invoke('qwill:set-title-theme', theme) as Promise<void>,
});
