import path from 'node:path';

import { app, nativeImage, type NativeImage } from 'electron';

import { resolveClientRoot } from './protocol';

const WINDOW_ICON_FILE = 'icon.ico';
const TRAY_SIZE = 16;

let cached: NativeImage | null = null;

function iconCandidates(): string[] {
  const generated = app.isPackaged
    ? path.join(process.resourcesPath, WINDOW_ICON_FILE)
    : path.join(app.getAppPath(), 'build', WINDOW_ICON_FILE);
  return [generated, path.join(resolveClientRoot(), 'icon-192.png')];
}

export function appIcon(): NativeImage {
  if (cached) return cached;

  for (const candidate of iconCandidates()) {
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) {
      cached = image;
      return image;
    }
  }

  cached = nativeImage.createEmpty();
  return cached;
}

export function trayIcon(): NativeImage {
  return appIcon().resize({ width: TRAY_SIZE, height: TRAY_SIZE });
}

export function windowIcon(): NativeImage {
  return appIcon();
}
