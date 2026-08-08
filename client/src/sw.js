import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';

// Список файлов для прекэша подставляет vite-plugin-pwa при сборке (self.__WB_MANIFEST).
precacheAndRoute(self.__WB_MANIFEST);

// Без этих двух строк новый SW встаёт в 'waiting' и продолжает отдавать старый закэшированный
// билд всем уже открытым вкладкам, пока их не закрыть все разом, — на активной разработке это
// выглядит так, будто правки не применяются вообще. skipWaiting активирует новый SW сразу же
// после установки, clientsClaim забирает под его контроль уже открытые вкладки без reload.
self.skipWaiting();
clientsClaim();

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
