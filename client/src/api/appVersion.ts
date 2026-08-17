import type { AppVersionInfo } from '@messenger/shared';

import { API_URL, apiRequest } from './client';

export function fetchAppVersion(): Promise<AppVersionInfo> {
  return apiRequest<AppVersionInfo>('/api/app/version');
}

export function apkDownloadUrl(info: AppVersionInfo): string {
  return `${API_URL}${info.apkUrl}`;
}
