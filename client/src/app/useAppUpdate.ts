import { useEffect, useState } from 'react';

import { isDesktopShell } from '../native/desktop';
import { isNativeShell } from '../native/shell';
import { useCallStore } from '../stores/callStore';
import { stashPendingDraft } from './pendingDraft';

export interface AppUpdate {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

function applyWaitingWorker(waiting: ServiceWorker): void {
  stashPendingDraft();
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** Обновление применяется только по команде пользователя: sw.js в проде намеренно не зовёт
 *  skipWaiting сам, поэтому новая версия ждёт в 'waiting', пока её не попросят.
 *
 *  В оболочке команды не будет вовсе: плашка там не показывается (её место занято
 *  обновлением APK, два «Обновить» с разным смыслом рядом — гарантированная путаница), и
 *  версия, дождавшаяся своего часа к моменту запуска, применяется молча. Только на холодном
 *  старте и только вне звонка: перезагрузка страницы посреди разговора оборвала бы его. */
export function useAppUpdate(): AppUpdate {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (isDesktopShell()) return;
    if (!('serviceWorker' in navigator)) return;

    const shell = isNativeShell();
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

      if (shell) {
        // Дождавшаяся своего часа версия применяется прямо здесь — это и есть холодный старт.
        // Появившиеся позже (updatefound) в оболочке игнорируются до следующего запуска.
        if (ready.waiting && navigator.serviceWorker.controller && useCallStore.getState().phase === 'idle') {
          applyWaitingWorker(ready.waiting);
        }
        return;
      }

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
    applyWaitingWorker(waiting);
  }

  return { updateAvailable: waiting !== null, applyUpdate };
}
