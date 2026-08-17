import type { AppVersionInfo } from '@messenger/shared';
import type { PluginListenerHandle } from '@capacitor/core';
import { create } from 'zustand';

import { apkDownloadUrl, fetchAppVersion } from '../api/appVersion';
import {
  cancelApkDownload,
  canInstallApk,
  discardApk,
  downloadApk,
  installApk,
  isNativeApkUpdateAvailable,
  onApkDownloadProgress,
  openInstallPermissionSettings,
} from '../native/apkUpdate';
import { getNativeAppVersion, isNativeAppInfoAvailable } from '../native/appVersion';

export type AppUpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

/** Ни один байт не пришёл столько времени — считаем закачку зависшей и обрываем сами:
 *  без этого оборванная посреди файла сеть оставляла бы полоску прогресса навсегда. */
const STALL_TIMEOUT_MS = 90_000;

export function isApkUpdateSupported(): boolean {
  return isNativeApkUpdateAvailable() && isNativeAppInfoAvailable();
}

export async function checkForApkUpdate(): Promise<AppVersionInfo | null> {
  if (!isApkUpdateSupported()) return null;
  return fetchAppVersion().catch(() => null);
}

interface AppUpdateState {
  info: AppVersionInfo | null;
  currentVersionCode: number | null;
  currentVersionName: string | null;
  phase: AppUpdatePhase;
  percent: number;
  error: string | null;
  permissionRequired: boolean;
  permissionJustGranted: boolean;
  /** Экран обновления открыт. Живёт в сторе, а не в состоянии экрана: открыть его умеют и
   *  строка в Настройках, и кнопка в объявлении из чата Qwill, а сама модалка одна и висит
   *  в оболочке (ОБНОВЛЕНИЯ-3). */
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  check: () => Promise<void>;
  download: () => Promise<void>;
  cancel: () => Promise<void>;
  install: () => Promise<void>;
  requestPermission: () => Promise<void>;
  recheckPermission: () => Promise<void>;
  reset: () => void;
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => {
  let progressListener: PluginListenerHandle | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  function clearStallTimer(): void {
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = null;
  }

  function armStallTimer(): void {
    clearStallTimer();
    stallTimer = setTimeout(() => {
      void cancelApkDownload();
    }, STALL_TIMEOUT_MS);
  }

  async function detachProgress(): Promise<void> {
    clearStallTimer();
    await progressListener?.remove();
    progressListener = null;
  }

  return {
    info: null,
    currentVersionCode: null,
    currentVersionName: null,
    phase: 'idle',
    percent: 0,
    error: null,
    permissionRequired: false,
    permissionJustGranted: false,
    modalOpen: false,

    openModal: () => {
      set({ modalOpen: true });
      if (!get().info) void get().check();
    },

    closeModal: () => set({ modalOpen: false }),

    check: async () => {
      if (!isApkUpdateSupported()) return;
      set({ phase: 'checking' });

      const [native, info] = await Promise.all([getNativeAppVersion(), checkForApkUpdate()]);
      set({
        info,
        currentVersionCode: native?.versionCode ?? null,
        currentVersionName: native?.versionName ?? null,
        phase: 'idle',
      });
    },

    download: async () => {
      const info = get().info;
      if (!info) return;

      set({ phase: 'downloading', percent: 0, error: null });
      progressListener = await onApkDownloadProgress(({ receivedBytes, totalBytes }) => {
        armStallTimer();
        set({ percent: totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0 });
      });
      armStallTimer();

      try {
        await downloadApk({ url: apkDownloadUrl(info), sha256: info.sha256, sizeBytes: info.sizeBytes });
        await detachProgress();
        set({ phase: 'ready', percent: 1, permissionRequired: !(await canInstallApk()) });
      } catch (error) {
        await detachProgress();
        set({
          phase: 'error',
          percent: 0,
          error: error instanceof Error ? error.message : 'Не удалось скачать обновление',
        });
      }
    },

    cancel: async () => {
      await cancelApkDownload();
      await detachProgress();
      await discardApk();
      set({ phase: 'idle', percent: 0, error: null, permissionJustGranted: false });
    },

    install: async () => {
      if (!(await canInstallApk())) {
        set({ permissionRequired: true, permissionJustGranted: false });
        return;
      }
      try {
        await installApk();
        set({ permissionRequired: false, permissionJustGranted: false });
      } catch (error) {
        set({ phase: 'error', error: error instanceof Error ? error.message : 'Не удалось начать установку' });
      }
    },

    requestPermission: async () => {
      await openInstallPermissionSettings();
    },

    /** Возврат из системных настроек не порождает никакого события в вебе — состояние
     *  тумблера приходится перечитывать самим, когда приложение снова оказалось на экране. */
    recheckPermission: async () => {
      if (!get().permissionRequired) return;
      if (!(await canInstallApk())) return;
      set({ permissionRequired: false, permissionJustGranted: true });
    },

    reset: () => {
      void detachProgress();
      set({ phase: 'idle', percent: 0, error: null });
    },
  };
});

export function selectUpdateAvailable(state: AppUpdateState): boolean {
  const { info, currentVersionCode } = state;
  return info !== null && currentVersionCode !== null && info.latestVersionCode > currentVersionCode;
}

/** Версия ниже минимальной — единственный случай, когда обновление перестаёт быть предложением. */
export function selectUpdateRequired(state: AppUpdateState): boolean {
  const { info, currentVersionCode } = state;
  return info !== null && currentVersionCode !== null && currentVersionCode < info.minSupportedVersionCode;
}
