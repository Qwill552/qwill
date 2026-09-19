import { openCacheDb } from './db';

export type NetworkKind = 'wifi' | 'cellular';
export type AutoDownloadKind = 'photo' | 'video' | 'gif' | 'file';

export interface AutoDownloadNetworkSettings {
  photo: boolean;
  video: boolean;
  gif: boolean;
  file: boolean;
  maxBytes: number | null;
}

export interface AutoDownloadSettings {
  cellular: AutoDownloadNetworkSettings;
  wifi: AutoDownloadNetworkSettings;
}

const MEGABYTE = 1024 * 1024;

export const AUTO_DOWNLOAD_SIZE_STEPS_MB = [1, 5, 10, 50, 100, 500] as const;

export const DEFAULT_AUTO_DOWNLOAD_SETTINGS: AutoDownloadSettings = {
  cellular: { photo: true, video: false, gif: false, file: false, maxBytes: 10 * MEGABYTE },
  wifi: { photo: true, video: true, gif: true, file: true, maxBytes: 100 * MEGABYTE },
};

const SETTINGS_KEY = 'autoDownload';

let cache: AutoDownloadSettings | null = null;
let inFlight: Promise<AutoDownloadSettings> | null = null;

function mergeWithDefaults(stored: Partial<AutoDownloadSettings> | undefined): AutoDownloadSettings {
  return {
    cellular: { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS.cellular, ...stored?.cellular },
    wifi: { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS.wifi, ...stored?.wifi },
  };
}

async function loadAutoDownloadSettings(): Promise<AutoDownloadSettings> {
  const db = await openCacheDb();
  if (!db) return DEFAULT_AUTO_DOWNLOAD_SETTINGS;

  try {
    const entry = await db.get('settings', SETTINGS_KEY);
    cache ??= mergeWithDefaults(entry?.value as Partial<AutoDownloadSettings> | undefined);
    return cache;
  } catch {
    return DEFAULT_AUTO_DOWNLOAD_SETTINGS;
  }
}

export function readAutoDownloadSettings(): Promise<AutoDownloadSettings> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= loadAutoDownloadSettings().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function writeAutoDownloadSettings(settings: AutoDownloadSettings): Promise<void> {
  cache = settings;
  inFlight = null;
  const db = await openCacheDb();
  if (!db) return;

  try {
    await db.put('settings', { key: SETTINGS_KEY, value: settings });
  } catch {
    return;
  }
}

export function resetAutoDownloadSettingsCache(): void {
  cache = null;
  inFlight = null;
}

export interface AutoDownloadDecisionInput {
  kind: AutoDownloadKind;
  network: NetworkKind;
  sizeBytes: number;
  cached: boolean;
  saveData: boolean;
  settings: AutoDownloadSettings;
}

export function shouldAutoDownload(input: AutoDownloadDecisionInput): boolean {
  if (input.cached) return true;
  if (input.saveData) return false;

  const rule = input.settings[input.network];
  if (!rule[input.kind]) return false;
  if (rule.maxBytes !== null && input.sizeBytes > rule.maxBytes) return false;
  return true;
}
