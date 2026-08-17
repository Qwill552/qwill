import fs from 'node:fs/promises';
import path from 'node:path';

import {
  APK_DOWNLOAD_PATH,
  APP_RELEASE_MANIFEST_FILE,
  appReleaseManifestSchema,
  type AppReleaseManifest,
  type AppVersionInfo,
} from '@messenger/shared';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

interface CachedRelease {
  mtimeMs: number;
  manifest: AppReleaseManifest;
  sizeBytes: number;
  apkPath: string;
}

let cache: CachedRelease | null = null;

function manifestPath(): string {
  return path.join(env.appReleaseDir, APP_RELEASE_MANIFEST_FILE);
}

async function readRelease(): Promise<CachedRelease | null> {
  const file = manifestPath();

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(file);
  } catch {
    cache = null;
    return null;
  }

  if (cache && cache.mtimeMs === stat.mtimeMs) return cache;

  let parsed: AppReleaseManifest;
  try {
    parsed = appReleaseManifestSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    logger.error({ err: error, file }, 'Манифест выпуска Android повреждён — обновление не раздаётся');
    cache = null;
    return null;
  }

  const apkPath = path.join(env.appReleaseDir, parsed.apkFile);
  let apkStat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    apkStat = await fs.stat(apkPath);
  } catch {
    logger.error({ apkPath }, 'Манифест выпуска ссылается на отсутствующий APK — обновление не раздаётся');
    cache = null;
    return null;
  }

  cache = { mtimeMs: stat.mtimeMs, manifest: parsed, sizeBytes: apkStat.size, apkPath };
  return cache;
}

export async function getAndroidRelease(): Promise<AppVersionInfo | null> {
  const release = await readRelease();
  if (!release) return null;

  return {
    latestVersionCode: release.manifest.latestVersionCode,
    versionName: release.manifest.versionName,
    minSupportedVersionCode: release.manifest.minSupportedVersionCode,
    apkUrl: APK_DOWNLOAD_PATH,
    sizeBytes: release.sizeBytes,
    sha256: release.manifest.sha256,
    changelog: release.manifest.changelog,
  };
}

export async function getAndroidApkFile(): Promise<{ path: string; size: number; fileName: string } | null> {
  const release = await readRelease();
  if (!release) return null;

  return {
    path: release.apkPath,
    size: release.sizeBytes,
    fileName: `qwill-${release.manifest.versionName}.apk`,
  };
}

export function resetAppReleaseCache(): void {
  cache = null;
}
