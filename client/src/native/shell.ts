import { Capacitor } from '@capacitor/core';

export function isNativeShell(): boolean {
  return Capacitor.isNativePlatform();
}
