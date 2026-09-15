import path from 'node:path';

import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron';

import { resolveClientRoot } from './protocol';
import { focusExistingWindow } from './window';

const TRAY_ICON_SIZE = 16;

let tray: Tray | null = null;
let quitting = false;

function trayIcon() {
  const source = nativeImage.createFromPath(path.join(resolveClientRoot(), 'icon-192.png'));
  return source.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
}

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
