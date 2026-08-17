import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface ApkDownloadProgress {
  receivedBytes: number;
  totalBytes: number;
}

interface ApkUpdatePlugin {
  canInstall(): Promise<{ granted: boolean }>;
  openInstallPermissionSettings(): Promise<{ opened: boolean }>;
  download(options: { url: string; sha256: string; sizeBytes: number }): Promise<void>;
  cancelDownload(): Promise<void>;
  discard(): Promise<void>;
  install(): Promise<void>;
  addListener(
    event: 'apkDownloadProgress',
    handler: (progress: ApkDownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<ApkUpdatePlugin>('QwillApkUpdate');

export type { ApkDownloadProgress };

export function isNativeApkUpdateAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillApkUpdate');
}

export function canInstallApk(): Promise<boolean> {
  return plugin
    .canInstall()
    .then((result) => result.granted)
    .catch(() => false);
}

export function openInstallPermissionSettings(): Promise<void> {
  return plugin.openInstallPermissionSettings().then(() => undefined);
}

export function onApkDownloadProgress(
  handler: (progress: ApkDownloadProgress) => void,
): Promise<PluginListenerHandle> {
  return plugin.addListener('apkDownloadProgress', handler);
}

export function downloadApk(options: { url: string; sha256: string; sizeBytes: number }): Promise<void> {
  return plugin.download(options);
}

export function cancelApkDownload(): Promise<void> {
  return plugin.cancelDownload().catch(() => undefined);
}

export function discardApk(): Promise<void> {
  return plugin.discard().catch(() => undefined);
}

export function installApk(): Promise<void> {
  return plugin.install();
}
