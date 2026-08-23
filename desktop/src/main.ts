import { app, ipcMain } from 'electron';

import { configureApiSession } from './apiSession';
import { APP_ENTRY_URL, handleAppProtocol, registerAppScheme, resolveClientRoot } from './protocol';
import { createMainWindow, focusExistingWindow, setWindowTitleTheme } from './window';

registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusExistingWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  ipcMain.handle('qwill:app-version', () => app.getVersion());

  ipcMain.handle('qwill:set-title-theme', (_event, theme: unknown) => {
    if (theme !== 'light' && theme !== 'dark') return;
    setWindowTitleTheme(theme);
  });

  void app.whenReady().then(async () => {
    configureApiSession();
    handleAppProtocol(resolveClientRoot());
    await createMainWindow(process.env.QWILL_DEV_SERVER ?? APP_ENTRY_URL);
  });
}
