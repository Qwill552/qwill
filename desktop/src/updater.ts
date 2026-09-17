import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

import { API_ORIGIN } from './apiSession';
import { markQuitting } from './tray';

const STATE_CHANNEL = 'qwill:updater-state';
const CHECK_CHANNEL = 'qwill:updater-check';
const INSTALL_CHANNEL = 'qwill:updater-install';
const AUTO_GET_CHANNEL = 'qwill:updater-auto-get';
const AUTO_SET_CHANNEL = 'qwill:updater-auto-set';
const SETTINGS_FILE = 'updater-settings.json';

const FEED_PATH = '/api/app/win';
const UPDATER_CACHE_DIR_NAME = 'qwill-updater';
const DEV_CONFIG_FILE = 'dev-app-update.yml';
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

type UpdaterState =
  | { phase: 'disabled' }
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'latest' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string };

let state: UpdaterState = { phase: 'disabled' };
let autoUpdate = true;

function settingsFilePath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function readAutoUpdate(): boolean {
  try {
    const raw: unknown = JSON.parse(readFileSync(settingsFilePath(), 'utf8'));
    return (raw as { autoUpdate?: unknown })?.autoUpdate !== false;
  } catch {
    return true;
  }
}

function writeAutoUpdate(enabled: boolean): void {
  try {
    writeFileSync(settingsFilePath(), JSON.stringify({ autoUpdate: enabled }), 'utf8');
  } catch {
    return;
  }
}

function publish(next: UpdaterState): void {
  state = next;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(STATE_CHANNEL, state);
  }
}

function pendingDir(): string {
  const base = process.env.LOCALAPPDATA ?? app.getPath('appData');
  return path.join(base, UPDATER_CACHE_DIR_NAME, 'pending');
}

async function clearPending(): Promise<void> {
  await rm(pendingDir(), { recursive: true, force: true }).catch(() => undefined);
}

function isMissingRelease(error: Error): boolean {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || /Cannot find channel/i.test(error.message);
}

function updaterUsable(): boolean {
  if (app.isPackaged) return true;
  return existsSync(path.join(app.getAppPath(), DEV_CONFIG_FILE));
}

async function checkForUpdates(): Promise<void> {
  if (!autoUpdate) return;
  if (state.phase === 'disabled' || state.phase === 'downloading' || state.phase === 'ready') return;
  await autoUpdater.checkForUpdates().catch(() => undefined);
}

async function applyAutoUpdate(enabled: boolean): Promise<void> {
  if (enabled === autoUpdate) return;
  autoUpdate = enabled;
  writeAutoUpdate(enabled);
  autoUpdater.autoInstallOnAppQuit = enabled;

  if (state.phase === 'disabled') return;

  if (!enabled) {
    publish({ phase: 'idle' });
    await clearPending();
    return;
  }
  await checkForUpdates();
}

export function registerUpdater(): void {
  ipcMain.handle(STATE_CHANNEL, () => state);
  ipcMain.handle(CHECK_CHANNEL, () => checkForUpdates());
  ipcMain.handle(AUTO_GET_CHANNEL, () => autoUpdate);
  ipcMain.handle(AUTO_SET_CHANNEL, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return;
    return applyAutoUpdate(enabled);
  });
  ipcMain.on(INSTALL_CHANNEL, () => {
    if (state.phase !== 'ready') return;
    markQuitting();
    autoUpdater.quitAndInstall(true, true);
  });
}

export async function startUpdater(): Promise<void> {
  if (!updaterUsable()) {
    publish({ phase: 'disabled' });
    return;
  }

  autoUpdate = readAutoUpdate();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = autoUpdate;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.forceDevUpdateConfig = !app.isPackaged;
  autoUpdater.setFeedURL({ provider: 'generic', url: `${API_ORIGIN}${FEED_PATH}` });

  autoUpdater.on('checking-for-update', () => publish({ phase: 'checking' }));
  autoUpdater.on('update-not-available', () => publish({ phase: 'latest' }));
  autoUpdater.on('update-available', (info) =>
    publish({ phase: 'downloading', version: info.version, percent: 0 }),
  );
  autoUpdater.on('download-progress', ({ percent }) =>
    publish({
      phase: 'downloading',
      version: state.phase === 'downloading' ? state.version : app.getVersion(),
      percent: Math.max(0, Math.min(1, percent / 100)),
    }),
  );
  autoUpdater.on('update-downloaded', (info) => publish({ phase: 'ready', version: info.version }));
  autoUpdater.on('error', (error) => {
    if (isMissingRelease(error)) {
      publish({ phase: 'latest' });
      return;
    }
    publish({ phase: 'error', message: error.message || 'Не удалось проверить обновление' });
  });

  publish({ phase: 'idle' });

  await clearPending();
  await checkForUpdates();

  setInterval(() => {
    if (BrowserWindow.getAllWindows().length === 0) return;
    void checkForUpdates();
  }, CHECK_INTERVAL_MS);
}
