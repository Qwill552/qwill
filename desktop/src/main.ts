import { app, ipcMain, session } from 'electron';

import { configureApiSession } from './apiSession';
import { registerAutostart, shouldStartHidden } from './autostart';
import { registerDeepLinkBridge, registerDeepLinkProtocol, routeDeepLinkFromArgv } from './deeplink';
import { registerNotifications } from './notifications';
import {
  APP_ENTRY_URL,
  APP_USER_MODEL_ID,
  handleAppProtocol,
  registerAppScheme,
  resolveClientRoot,
} from './protocol';
import { pickScreenSource, registerScreenSourcePicker } from './screenSources';
import { createTray, installCloseToTray } from './tray';
import { registerUpdater, startUpdater } from './updater';
import { createMainWindow, enforceDesktopWidth, focusExistingWindow, setWindowTitleTheme } from './window';

app.setAppUserModelId(APP_USER_MODEL_ID);
registerAppScheme();
registerDeepLinkProtocol();

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
  app.on('second-instance', (_event, argv) => {
    focusExistingWindow();
    routeDeepLinkFromArgv(argv);
  });

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
  registerNotifications();
  registerAutostart();
  registerDeepLinkBridge();

  void app.whenReady().then(async () => {
    configureApiSession();
    configureDisplayMedia();
    handleAppProtocol(resolveClientRoot());
    createTray();
    const window = await createMainWindow(process.env.QWILL_DEV_SERVER ?? APP_ENTRY_URL, {
      startHidden: shouldStartHidden(),
    });
    installCloseToTray(window);
    routeDeepLinkFromArgv(process.argv);
    await startUpdater();
  });
}
