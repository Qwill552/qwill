const SW_URL = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { type: import.meta.env.DEV ? 'module' : 'classic' })
      .catch(() => null);
  }

  return registrationPromise;
}
