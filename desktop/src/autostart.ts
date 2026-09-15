import path from 'node:path';

import { app, ipcMain } from 'electron';

const HIDDEN_ARG = '--hidden';
const GET_CHANNEL = 'qwill:autostart-get';
const SET_CHANNEL = 'qwill:autostart-set';

function launchArgs(): string[] {
  if (app.isPackaged) return [HIDDEN_ARG];
  return [`"${path.resolve(process.argv[1] ?? app.getAppPath())}"`, HIDDEN_ARG];
}

export function shouldStartHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG);
}

export function getAutostart(): boolean {
  return app.getLoginItemSettings({ path: process.execPath, args: launchArgs() }).openAtLogin;
}

export function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: enabled ? launchArgs() : [],
  });
}

export function registerAutostart(): void {
  ipcMain.handle(GET_CHANNEL, () => getAutostart());
  ipcMain.handle(SET_CHANNEL, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return;
    setAutostart(enabled);
  });
}
