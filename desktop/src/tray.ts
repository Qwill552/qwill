import { Menu, Tray, app, type BrowserWindow } from 'electron';

import { trayIcon } from './appIcon';
import { focusExistingWindow } from './window';

let tray: Tray | null = null;
let quitting = false;

export function createTray(): void {
  if (tray) return;

  tray = new Tray(trayIcon());
  tray.setToolTip('Qwill');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть', click: focusExistingWindow },
      { label: 'Выйти', click: quitApp },
    ]),
  );
  tray.on('click', focusExistingWindow);
}

export function installCloseToTray(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
}

export function markQuitting(): void {
  quitting = true;
}

export function quitApp(): void {
  markQuitting();
  app.quit();
}
