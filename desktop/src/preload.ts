import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const SCREEN_SOURCES_CHANNEL = 'qwill:screen-sources';
const SCREEN_SOURCE_CHOSEN_CHANNEL = 'qwill:screen-source-chosen';
const UPDATER_STATE_CHANNEL = 'qwill:updater-state';
const UPDATER_CHECK_CHANNEL = 'qwill:updater-check';
const UPDATER_INSTALL_CHANNEL = 'qwill:updater-install';
const UPDATER_AUTO_GET_CHANNEL = 'qwill:updater-auto-get';
const UPDATER_AUTO_SET_CHANNEL = 'qwill:updater-auto-set';
const NOTIFY_CHANNEL = 'qwill:notify';
const BADGE_CHANNEL = 'qwill:set-badge-count';
const CLOSE_CHAT_CHANNEL = 'qwill:close-chat-notifications';
const POPUP_SHOW_CHANNEL = 'qwill:notification-show';
const POPUP_CLOSE_CHAT_CHANNEL = 'qwill:notification-close-chat';
const POPUP_THEME_CHANNEL = 'qwill:notification-theme';
const POPUP_OPEN_CHANNEL = 'qwill:notification-open';
const POPUP_RESIZE_CHANNEL = 'qwill:notification-resize';
const AUTOSTART_GET_CHANNEL = 'qwill:autostart-get';
const AUTOSTART_SET_CHANNEL = 'qwill:autostart-set';
const DEEP_LINK_CHANNEL = 'qwill:deep-link';
const DEEP_LINK_PENDING_CHANNEL = 'qwill:deep-link-pending';
const WINDOW_MINIMIZE_CHANNEL = 'qwill:window-minimize';
const WINDOW_TOGGLE_MAXIMIZE_CHANNEL = 'qwill:window-toggle-maximize';
const WINDOW_CLOSE_CHANNEL = 'qwill:window-close';
const WINDOW_MAXIMIZED_CHANNEL = 'qwill:window-maximized';
const WINDOW_MAXIMIZED_CHANGED_CHANNEL = 'qwill:window-maximized-changed';

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
    getAuto: (): Promise<boolean> => ipcRenderer.invoke(UPDATER_AUTO_GET_CHANNEL) as Promise<boolean>,
    setAuto: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(UPDATER_AUTO_SET_CHANNEL, enabled) as Promise<void>,
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
  closeChatNotifications: (chatId: string): void => {
    ipcRenderer.send(CLOSE_CHAT_CHANNEL, chatId);
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
  windowControls: {
    minimize: (): void => {
      ipcRenderer.send(WINDOW_MINIMIZE_CHANNEL);
    },
    toggleMaximize: (): void => {
      ipcRenderer.send(WINDOW_TOGGLE_MAXIMIZE_CHANNEL);
    },
    close: (): void => {
      ipcRenderer.send(WINDOW_CLOSE_CHANNEL);
    },
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(WINDOW_MAXIMIZED_CHANNEL) as Promise<boolean>,
    onMaximizedChange: (handler: (maximized: unknown) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, maximized: unknown): void => handler(maximized);
      ipcRenderer.on(WINDOW_MAXIMIZED_CHANGED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(WINDOW_MAXIMIZED_CHANGED_CHANNEL, listener);
      };
    },
  },
});

function subscribe(channel: string, handler: (payload: unknown) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: unknown): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('qwillNotifications', {
  onShow: (handler: (item: unknown) => void): (() => void) => subscribe(POPUP_SHOW_CHANNEL, handler),
  onCloseChat: (handler: (chatId: unknown) => void): (() => void) => subscribe(POPUP_CLOSE_CHAT_CHANNEL, handler),
  onTheme: (handler: (theme: unknown) => void): (() => void) => subscribe(POPUP_THEME_CHANNEL, handler),
  open: (chatId: string): void => {
    ipcRenderer.send(POPUP_OPEN_CHANNEL, chatId);
  },
  resize: (height: number): void => {
    ipcRenderer.send(POPUP_RESIZE_CHANNEL, height);
  },
});
