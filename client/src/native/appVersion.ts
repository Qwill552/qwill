import { Capacitor, registerPlugin } from '@capacitor/core';

interface AppInfoPlugin {
  getAppInfo(): Promise<{ versionCode: number; versionName: string }>;
}

const plugin = registerPlugin<AppInfoPlugin>('QwillAppInfo');

export function isNativeAppInfoAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillAppInfo');
}

export async function getNativeAppVersion(): Promise<{ versionCode: number; versionName: string } | null> {
  if (!isNativeAppInfoAvailable()) return null;
  return plugin.getAppInfo().catch(() => null);
}
