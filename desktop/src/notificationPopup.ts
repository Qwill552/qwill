import path from 'node:path';

import { BrowserWindow, ipcMain, screen } from 'electron';

import { routeDeepLink } from './deeplink';
import { APP_ORIGIN } from './protocol';
import { focusExistingWindow, getMainWindow, windowTheme } from './window';

const SHOW_CHANNEL = 'qwill:notification-show';
const CLOSE_CHAT_CHANNEL = 'qwill:notification-close-chat';
const THEME_CHANNEL = 'qwill:notification-theme';
const OPEN_CHANNEL = 'qwill:notification-open';
const RESIZE_CHANNEL = 'qwill:notification-resize';

const POPUP_WIDTH = 392;
const SCREEN_MARGIN = 12;

export interface PopupItem {
  id: number;
  chatId: string;
  title: string;
  body: string;
  time: string;
  avatarColor: string | null;
  avatarUrl: string | null;
}

let popup: BrowserWindow | null = null;

function popupBounds(height: number): Electron.Rectangle {
  const main = getMainWindow();
  const display = main ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay();
  const { x, y, width, height: workHeight } = display.workArea;

  return {
    width: POPUP_WIDTH,
    height,
    x: x + width - POPUP_WIDTH - SCREEN_MARGIN,
    y: y + workHeight - height - SCREEN_MARGIN,
  };
}

function createPopup(): BrowserWindow {
  const window = new BrowserWindow({
    ...popupBounds(1),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    roundedCorners: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setAlwaysOnTop(true, 'screen-saver');
  window.on('closed', () => {
    popup = null;
  });

  void window.loadURL(`${APP_ORIGIN}/notification.html?theme=${windowTheme()}`);
  return window;
}

function applyHeight(height: number): void {
  if (!popup || popup.isDestroyed()) return;

  if (height <= 0) {
    popup.hide();
    return;
  }

  popup.setBounds(popupBounds(height));
  if (!popup.isVisible()) popup.showInactive();
}

export function showPopupNotification(item: PopupItem): boolean {
  try {
    if (!popup || popup.isDestroyed()) popup = createPopup();
  } catch {
    return false;
  }

  const send = (): void => {
    if (popup && !popup.isDestroyed()) popup.webContents.send(SHOW_CHANNEL, item);
  };

  if (popup.webContents.isLoading()) popup.webContents.once('did-finish-load', send);
  else send();

  return true;
}

export function closePopupNotifications(chatId: string): void {
  if (!popup || popup.isDestroyed()) return;
  popup.webContents.send(CLOSE_CHAT_CHANNEL, chatId);
}

export function setPopupTheme(theme: 'light' | 'dark'): void {
  if (!popup || popup.isDestroyed()) return;
  popup.webContents.send(THEME_CHANNEL, theme);
}

export function registerNotificationPopup(): void {
  ipcMain.on(OPEN_CHANNEL, (_event, chatId: unknown) => {
    if (typeof chatId !== 'string' || chatId === '') return;
    focusExistingWindow();
    routeDeepLink({ type: 'chat', id: chatId });
  });

  ipcMain.on(RESIZE_CHANNEL, (_event, height: unknown) => {
    if (typeof height !== 'number' || !Number.isFinite(height)) return;
    applyHeight(Math.max(0, Math.round(height)));
  });
}
