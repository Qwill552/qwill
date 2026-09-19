import { useEffect, useState } from 'react';

import { apkDownloadUrl, fetchAppVersion, fetchWindowsVersion, windowsDownloadUrl } from '../../api/appVersion';
import { ApiError } from '../../api/client';
import { formatBytes } from '../../features/messages/Attachment';
import type { OsChoice } from './useOsChoice';

export type ReleaseState = 'loading' | 'ready' | 'unavailable' | 'offline';

export type ReleaseFormat = 'APK' | 'EXE' | 'ZIP';

export interface ReleaseInfo {
  state: ReleaseState;
  format: ReleaseFormat;
  versionName: string | null;
  sizeLabel: string | null;
  fileUrl: string | null;
  changelog: string[];
}

function formatFor(os: OsChoice): ReleaseFormat {
  return os === 'android' ? 'APK' : 'EXE';
}

function emptyRelease(os: OsChoice, state: ReleaseState): ReleaseInfo {
  return { state, format: formatFor(os), versionName: null, sizeLabel: null, fileUrl: null, changelog: [] };
}

export function useRelease(os: OsChoice): ReleaseInfo {
  const [release, setRelease] = useState<ReleaseInfo>(() => emptyRelease(os, 'loading'));

  useEffect(() => {
    let cancelled = false;
    setRelease(emptyRelease(os, 'loading'));

    const request =
      os === 'android'
        ? fetchAppVersion().then((info) => ({
            format: 'APK' as const,
            versionName: info.versionName,
            sizeLabel: formatBytes(info.sizeBytes),
            fileUrl: apkDownloadUrl(info),
            changelog: info.changelog,
          }))
        : fetchWindowsVersion().then((info) => ({
            format: info.zipUrl === null ? ('EXE' as const) : ('ZIP' as const),
            versionName: info.versionName,
            sizeLabel: formatBytes(info.zipSizeBytes ?? info.sizeBytes),
            fileUrl: windowsDownloadUrl(info),
            changelog: info.changelog,
          }));

    request
      .then((data) => {
        if (cancelled) return;
        setRelease({ state: 'ready', ...data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const state = error instanceof ApiError && error.status === 404 ? 'unavailable' : 'offline';
        setRelease(emptyRelease(os, state));
      });

    return () => {
      cancelled = true;
    };
  }, [os]);

  return release;
}
