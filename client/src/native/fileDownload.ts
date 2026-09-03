import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface FileDownloadProgress {
  fileId: string;
  receivedBytes: number;
  totalBytes: number;
}

interface FileDownloadPlugin {
  status(options: { fileId: string; fileName: string }): Promise<{ downloaded: boolean }>;
  download(options: { fileId: string; fileName: string; url: string }): Promise<void>;
  cancel(options: { fileId: string }): Promise<void>;
  open(options: { fileId: string; fileName: string; mimeType?: string }): Promise<{ opened: boolean }>;
  addListener(
    event: 'fileDownloadProgress',
    handler: (progress: FileDownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<FileDownloadPlugin>('QwillFiles');

export type { FileDownloadProgress };

export function isNativeFileDownloadAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillFiles');
}

export function isFileDownloaded(fileId: string, fileName: string): Promise<boolean> {
  return plugin
    .status({ fileId, fileName })
    .then((result) => result.downloaded)
    .catch(() => false);
}

export function downloadNativeFile(fileId: string, fileName: string, url: string): Promise<void> {
  return plugin.download({ fileId, fileName, url });
}

export function cancelNativeFileDownload(fileId: string): Promise<void> {
  return plugin.cancel({ fileId }).catch(() => undefined);
}

export function openNativeFile(fileId: string, fileName: string, mimeType: string): Promise<boolean> {
  return plugin
    .open({ fileId, fileName, mimeType })
    .then((result) => result.opened)
    .catch(() => false);
}

export function onFileDownloadProgress(
  handler: (progress: FileDownloadProgress) => void,
): Promise<PluginListenerHandle> {
  return plugin.addListener('fileDownloadProgress', handler);
}
