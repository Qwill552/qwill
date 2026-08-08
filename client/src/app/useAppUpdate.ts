import { useEffect, useState } from 'react';

import { stashPendingDraft } from './pendingDraft';

export interface AppUpdate {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

/** Обновление применяется только по команде пользователя: sw.js в проде намеренно не зовёт
 *  skipWaiting сам, поэтому новая версия ждёт в 'waiting', пока её не попросят. */
export function useAppUpdate(): AppUpdate {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    function trackInstalling(worker: ServiceWorker): void {
      worker.addEventListener('statechange', () => {
        // Без контроллера 'installed' означает первую установку, а не обновление.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
      });
    }

    function handleUpdateFound(): void {
      const installing = registration?.installing;
      if (installing) trackInstalling(installing);
    }

    function checkForUpdate(): void {
      if (document.visibilityState !== 'visible') return;
      void registration?.update().catch(() => undefined);
    }

    void navigator.serviceWorker.ready.then((ready) => {
      if (cancelled) return;

      registration = ready;
      if (ready.waiting && navigator.serviceWorker.controller) setWaiting(ready.waiting);
      if (ready.installing) trackInstalling(ready.installing);
      ready.addEventListener('updatefound', handleUpdateFound);
      document.addEventListener('visibilitychange', checkForUpdate);
    });

    return () => {
      cancelled = true;
      registration?.removeEventListener('updatefound', handleUpdateFound);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);

  function applyUpdate(): void {
    if (!waiting) return;

    stashPendingDraft();
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  return { updateAvailable: waiting !== null, applyUpdate };
}
