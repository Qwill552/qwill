import { app, ipcMain } from 'electron';

const HIDDEN_ARG = '--hidden';
const GET_CHANNEL = 'qwill:autostart-get';
const SET_CHANNEL = 'qwill:autostart-set';

export function shouldStartHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG);
}

export function getAutostart(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

export function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? [HIDDEN_ARG] : [] });
}

export function registerAutostart(): void {
  ipcMain.handle(GET_CHANNEL, () => getAutostart());
  ipcMain.handle(SET_CHANNEL, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return;
    setAutostart(enabled);
  });
}
