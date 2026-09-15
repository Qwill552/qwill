import { app, ipcMain, session } from 'electron';

import { configureApiSession } from './apiSession';
import { APP_ENTRY_URL, handleAppProtocol, registerAppScheme, resolveClientRoot } from './protocol';
import { pickScreenSource, registerScreenSourcePicker } from './screenSources';
import { registerUpdater, startUpdater } from './updater';
import { createMainWindow, enforceDesktopWidth, focusExistingWindow, setWindowTitleTheme } from './window';

registerAppScheme();

function configureDisplayMedia(): void {
  registerScreenSourcePicker();
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void pickScreenSource().then(
      (source) => callback(source ? { video: source } : {}),
      () => callback({}),
    );
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusExistingWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  ipcMain.handle('qwill:app-version', () => app.getVersion());

  ipcMain.handle('qwill:ensure-desktop-width', () => {
    enforceDesktopWidth();
  });

  ipcMain.handle('qwill:set-title-theme', (_event, theme: unknown) => {
    if (theme !== 'light' && theme !== 'dark') return;
    setWindowTitleTheme(theme);
  });

  registerUpdater();

  void app.whenReady().then(async () => {
    configureApiSession();
    configureDisplayMedia();
    handleAppProtocol(resolveClientRoot());
    await createMainWindow(process.env.QWILL_DEV_SERVER ?? APP_ENTRY_URL);
    await startUpdater();
  });
}
