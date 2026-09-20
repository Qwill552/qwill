import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

import {
  assembleRange,
  chunkIndexesFor,
  chunkRange,
  contentRangeHeader,
  parseContentRangeTotal,
  parseRangeHeader,
  parseRangeStart,
  parseStreamUrl,
  planServedRange,
  readCachedChunk,
  readVideoInfo,
  writeCachedChunk,
  writeVideoInfo,
  VIDEO_CHUNK_BYTES,
  VIDEO_SOURCE_MESSAGE,
  VIDEO_SOURCE_REQUEST_MESSAGE,
  VIDEO_STREAM_PREFIX,
} from './cache/videoCache';

// Режим определяется по URL регистрации (serviceWorker.ts ставит /dev-sw.js?dev-sw в dev), а не по
// import.meta.env.DEV: service worker собирается отдельным проходом, в котором DEV истинен
// и в продакшен-сборке.
const isDevServiceWorker = self.location.search.includes('dev-sw');

// Список файлов для прекэша подставляет vite-plugin-pwa при сборке (self.__WB_MANIFEST) — в dev
// он всегда пуст, поэтому createHandlerBoundToURL('index.html') там упал бы на несуществующей
// прекэш-записи. Офлайн на dev-сервере не поддерживается в принципе (CLAUDE.md: не hot-reload,
// не unbundled-модули Vite), так что в dev маршрут навигации просто не регистрируется.
precacheAndRoute(self.__WB_MANIFEST);

if (!isDevServiceWorker) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/capture-probe\.html$/] }));
}

// В dev новый SW встаёт в 'waiting' и продолжает отдавать старый закэшированный билд всем
// уже открытым вкладкам, пока их не закрыть все разом, — выглядит так, будто правки не
// применяются вообще. В проде ожидание нужно: именно оно даёт возможность спросить
// пользователя, а обновление применяется по команде из UpdateBanner.
if (isDevServiceWorker) {
  self.skipWaiting();
  clientsClaim();
}

const videoSources = new Map();

const SOURCE_REQUEST_TIMEOUT_MS = 3000;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();

  if (event.data?.type === VIDEO_SOURCE_MESSAGE && typeof event.data.fileId === 'string') {
    videoSources.set(event.data.fileId, event.data.url);
    event.ports[0]?.postMessage({ ok: true });
  }
});

function askClientForSource(client, fileId) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), SOURCE_REQUEST_TIMEOUT_MS);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data?.url === 'string' ? event.data.url : null);
    };

    client.postMessage({ type: VIDEO_SOURCE_REQUEST_MESSAGE, fileId }, [channel.port2]);
  });
}

async function requestSource(fileId, clientId) {
  const owner = clientId ? await self.clients.get(clientId) : null;
  const windows = await self.clients.matchAll({ type: 'window' });
  const targets = owner ? [owner, ...windows.filter((client) => client.id !== owner.id)] : windows;

  for (const target of targets) {
    const url = await askClientForSource(target, fileId);
    if (url) {
      videoSources.set(fileId, url);
      return url;
    }
  }
  return null;
}

async function sourceFor(fileId, clientId) {
  return videoSources.get(fileId) ?? (await requestSource(fileId, clientId));
}

async function fetchRange(fileId, clientId, range) {
  let url = await sourceFor(fileId, clientId);
  if (!url) return null;

  const ask = (from, to) => fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
  let response = await ask(range.start, range.end);

  if (response.status === 401 || response.status === 403) {
    videoSources.delete(fileId);
    url = await requestSource(fileId, clientId);
    if (!url) return null;
    response = await ask(range.start, range.end);
  }

  if (response.status === 416) {
    const total = parseContentRangeTotal(response.headers.get('Content-Range'));
    if (total === null || range.start >= total) return null;
    response = await ask(range.start, Math.min(range.end, total - 1));
  }

  if (response.status !== 206) return null;

  const totalSize = parseContentRangeTotal(response.headers.get('Content-Range'));
  if (totalSize === null) return null;

  return {
    bytes: await response.arrayBuffer(),
    totalSize,
    mimeType: response.headers.get('Content-Type') || 'video/mp4',
  };
}

async function ensureVideoInfo(fileId, chatId, clientId, request) {
  const known = await readVideoInfo(fileId);
  if (known) return known;

  const start = parseRangeStart(request.headers.get('Range'));
  if (start === null) return null;

  const index = Math.floor(start / VIDEO_CHUNK_BYTES);
  const probeStart = index * VIDEO_CHUNK_BYTES;
  const probe = await fetchRange(fileId, clientId, { start: probeStart, end: probeStart + VIDEO_CHUNK_BYTES - 1 });
  if (!probe) return null;

  const info = { totalSize: probe.totalSize, mimeType: probe.mimeType };
  await writeVideoInfo(fileId, info);
  await writeCachedChunk(fileId, index, { chatId, totalSize: info.totalSize }, probe.bytes);
  return info;
}

async function streamFromNetwork(fileId, clientId, request) {
  const url = await sourceFor(fileId, clientId);
  if (!url) return new Response(null, { status: 504 });

  const range = request.headers.get('Range');
  return fetch(url, range ? { headers: { Range: range } } : undefined);
}

async function serveVideo(request, clientId, target) {
  const { fileId, chatId } = target;
  const info = await ensureVideoInfo(fileId, chatId, clientId, request);
  if (!info) return streamFromNetwork(fileId, clientId, request);

  const requested = parseRangeHeader(request.headers.get('Range'), info.totalSize);
  if (!requested) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${info.totalSize}`, 'Accept-Ranges': 'bytes' },
    });
  }

  const served = planServedRange(requested, info.totalSize);
  const parts = [];

  for (const index of chunkIndexesFor(served)) {
    let bytes = await readCachedChunk(fileId, index);
    if (!bytes) {
      const fetched = await fetchRange(fileId, clientId, chunkRange(index, info.totalSize));
      if (!fetched) return streamFromNetwork(fileId, clientId, request);
      bytes = fetched.bytes;
      await writeCachedChunk(fileId, index, { chatId, totalSize: info.totalSize }, bytes);
    }
    parts.push({ index, bytes });
  }

  const body = assembleRange(parts, served);
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': info.mimeType,
      'Content-Length': String(body.byteLength),
      'Content-Range': contentRangeHeader(served, info.totalSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(VIDEO_STREAM_PREFIX)) return;

  const target = parseStreamUrl(url.pathname, url.search);
  if (!target) return;

  event.respondWith(
    serveVideo(event.request, event.clientId, target)
      .catch(() => streamFromNetwork(target.fileId, event.clientId, event.request))
      .catch(() => new Response(null, { status: 504 })),
  );
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

  const isCall = payload.kind === 'call';

  // Прочтение на другом устройстве снимает уведомление и здесь: показывать нечего, гасим
  // по тегу чата (R-38).
  if (payload.kind === 'read') {
    event.waitUntil(
      self.registration
        .getNotifications({ tag: `chat-${payload.chatId}` })
        .then((notifications) => notifications.forEach((notification) => notification.close())),
    );
    return;
  }

  if (payload.kind === 'call-taken' || payload.kind === 'call-ended') {
    event.waitUntil(
      self.registration
        .getNotifications({ tag: `call-${payload.chatId}` })
        .then((notifications) => notifications.forEach((notification) => notification.close())),
    );
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Messenger', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: isCall ? `call-${payload.chatId}` : `chat-${payload.chatId}`,
      requireInteraction: isCall,
      renotify: isCall,
      vibrate: isCall ? [1000, 500, 1000, 500] : undefined,
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
