import type { AppVersionInfo, WindowsVersionInfo } from '@messenger/shared';

import { API_URL, apiRequest } from './client';

export function fetchAppVersion(): Promise<AppVersionInfo> {
  return apiRequest<AppVersionInfo>('/api/app/version');
}

export function apkDownloadUrl(info: AppVersionInfo): string {
  return `${API_URL}${info.apkUrl}`;
}

export function fetchWindowsVersion(): Promise<WindowsVersionInfo> {
  return apiRequest<WindowsVersionInfo>('/api/app/win/version');
}

export function exeDownloadUrl(info: WindowsVersionInfo): string {
  return `${API_URL}${info.exeUrl}`;
}

export function windowsDownloadUrl(info: WindowsVersionInfo): string {
  return `${API_URL}${info.zipUrl ?? info.exeUrl}`;
}
