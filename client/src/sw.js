import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Список файлов для прекэша подставляет vite-plugin-pwa при сборке (self.__WB_MANIFEST).
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// В dev новый SW встаёт в 'waiting' и продолжает отдавать старый закэшированный билд всем
// уже открытым вкладкам, пока их не закрыть все разом, — выглядит так, будто правки не
// применяются вообще. В проде ожидание нужно: именно оно даёт возможность спросить
// пользователя, а обновление применяется по команде из UpdateBanner.
// Режим определяется по URL регистрации (push.ts ставит /dev-sw.js?dev-sw в dev), а не по
// import.meta.env.DEV: service worker собирается отдельным проходом, в котором DEV истинен
// и в продакшен-сборке.
const isDevServiceWorker = self.location.search.includes('dev-sw');

if (isDevServiceWorker) {
  self.skipWaiting();
  clientsClaim();
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Пуш приходит даже когда вкладка закрыта — SW сам показывает нативное уведомление (этап 9). */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Messenger', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { chatId: payload.chatId },
    }),
  );
});

/** Клик по уведомлению — фокус на уже открытой вкладке вместо новой (этап 9). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  const targetUrl = chatId ? `/?chat=${encodeURIComponent(chatId)}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
