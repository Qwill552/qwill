import { beforeEach, describe, expect, it } from 'vitest';

import { clearAllCache } from './db';
import {
  DEFAULT_AUTO_DOWNLOAD_SETTINGS,
  readAutoDownloadSettings,
  resetAutoDownloadSettingsCache,
  shouldAutoDownload,
  writeAutoDownloadSettings,
  type AutoDownloadSettings,
} from './settings';

describe('shouldAutoDownload', () => {
  it('разрешает то, что уже в кэше, независимо от настроек и сети', () => {
    expect(
      shouldAutoDownload({
        kind: 'video',
        network: 'cellular',
        sizeBytes: 999_000_000,
        cached: true,
        saveData: true,
        settings: DEFAULT_AUTO_DOWNLOAD_SETTINGS,
      }),
    ).toBe(true);
  });

  it('запрещает всё при включённой экономии трафика, даже если кэша нет', () => {
    expect(
      shouldAutoDownload({
        kind: 'photo',
        network: 'wifi',
        sizeBytes: 1000,
        cached: false,
        saveData: true,
        settings: DEFAULT_AUTO_DOWNLOAD_SETTINGS,
      }),
    ).toBe(false);
  });

  it('запрещает вид, выключенный для этой сети', () => {
    expect(
      shouldAutoDownload({
        kind: 'video',
        network: 'cellular',
        sizeBytes: 1000,
        cached: false,
        saveData: false,
        settings: DEFAULT_AUTO_DOWNLOAD_SETTINGS,
      }),
    ).toBe(false);
  });

  it('разрешает вид, включённый для этой сети, в пределах потолка', () => {
    expect(
      shouldAutoDownload({
        kind: 'photo',
        network: 'cellular',
        sizeBytes: 1000,
        cached: false,
        saveData: false,
        settings: DEFAULT_AUTO_DOWNLOAD_SETTINGS,
      }),
    ).toBe(true);
  });

  it('запрещает файл больше потолка размера', () => {
    expect(
      shouldAutoDownload({
        kind: 'photo',
        network: 'cellular',
        sizeBytes: 20 * 1024 * 1024,
        cached: false,
        saveData: false,
        settings: DEFAULT_AUTO_DOWNLOAD_SETTINGS,
      }),
    ).toBe(false);
  });

  it('разрешает файл в пределах потолка на Wi-Fi', () => {
    expect(
      shouldAutoDownload({
        kind: 'video',
        network: 'wifi',
        sizeBytes: 90 * 1024 * 1024,
        cached: false,
        saveData: false,
        settings: DEFAULT_AUTO_DOWNLOAD_SETTINGS,
      }),
    ).toBe(true);
  });

  it('потолок null снимает ограничение размера целиком', () => {
    const settings: AutoDownloadSettings = {
      ...DEFAULT_AUTO_DOWNLOAD_SETTINGS,
      wifi: { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS.wifi, maxBytes: null },
    };

    expect(
      shouldAutoDownload({
        kind: 'video',
        network: 'wifi',
        sizeBytes: 999_000_000,
        cached: false,
        saveData: false,
        settings,
      }),
    ).toBe(true);
  });
});

describe('хранилище настроек автозагрузки', () => {
  beforeEach(async () => {
    resetAutoDownloadSettingsCache();
    await clearAllCache();
    resetAutoDownloadSettingsCache();
  });

  it('без записанных настроек отдаёт умолчания', async () => {
    expect(await readAutoDownloadSettings()).toEqual(DEFAULT_AUTO_DOWNLOAD_SETTINGS);
  });

  it('переживает запись и повторное чтение', async () => {
    const custom: AutoDownloadSettings = {
      cellular: { photo: false, video: false, gif: false, file: false, maxBytes: 5 * 1024 * 1024 },
      wifi: { photo: true, video: true, gif: true, file: true, maxBytes: null },
    };

    await writeAutoDownloadSettings(custom);
    resetAutoDownloadSettingsCache();

    expect(await readAutoDownloadSettings()).toEqual(custom);
  });

  it('дополняет частично сохранённые настройки умолчаниями', async () => {
    await writeAutoDownloadSettings({
      cellular: { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS.cellular, video: true },
    } as AutoDownloadSettings);
    resetAutoDownloadSettingsCache();

    const settings = await readAutoDownloadSettings();
    expect(settings.cellular.video).toBe(true);
    expect(settings.wifi).toEqual(DEFAULT_AUTO_DOWNLOAD_SETTINGS.wifi);
  });
});
