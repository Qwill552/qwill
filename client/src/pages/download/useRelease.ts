import { useEffect, useState } from 'react';

import { apkDownloadUrl, exeDownloadUrl, fetchAppVersion, fetchWindowsVersion } from '../../api/appVersion';
import { ApiError } from '../../api/client';
import { formatBytes } from '../../features/messages/Attachment';
import type { OsChoice } from './useOsChoice';

export type ReleaseState = 'loading' | 'ready' | 'unavailable' | 'offline';

export interface ReleaseInfo {
  state: ReleaseState;
  format: 'APK' | 'EXE';
  versionName: string | null;
  sizeLabel: string | null;
  fileUrl: string | null;
  changelog: string[];
}

function formatFor(os: OsChoice): 'APK' | 'EXE' {
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
            versionName: info.versionName,
            sizeLabel: formatBytes(info.sizeBytes),
            fileUrl: apkDownloadUrl(info),
            changelog: info.changelog,
          }))
        : fetchWindowsVersion().then((info) => ({
            versionName: info.versionName,
            sizeLabel: formatBytes(info.sizeBytes),
            fileUrl: exeDownloadUrl(info),
            changelog: info.changelog,
          }));

    request
      .then((data) => {
        if (cancelled) return;
        setRelease({ state: 'ready', format: formatFor(os), ...data });
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
