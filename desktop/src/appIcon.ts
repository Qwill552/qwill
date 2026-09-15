import path from 'node:path';

import { app, nativeImage, type NativeImage } from 'electron';

import { resolveClientRoot } from './protocol';

const ICON_FILE = 'app-icon.png';
const TRAY_SIZE = 16;

let cached: NativeImage | null = null;

export function appIcon(): NativeImage {
  if (cached) return cached;

  const candidates = [path.join(app.getAppPath(), ICON_FILE), path.join(resolveClientRoot(), 'icon-192.png')];
  for (const candidate of candidates) {
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
