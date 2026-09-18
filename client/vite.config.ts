import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import { VitePWA } from 'vite-plugin-pwa';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      // qwillsandbox.localhost — домен песочницы визиток в локальной разработке (R-30).
      // Браузер резолвит любой *.localhost в 127.0.0.1 сам, но сертификат его не покрывал бы:
      // сервер читает те же файлы из ~/.vite-plugin-mkcert, что и Vite (server/src/config/env.ts,
      // devHttpsCredentials), и без этой строки песочница по https не открывается.
      mkcert({ hosts: ['localhost', '127.0.0.1', 'qwillsandbox.localhost'] }),
      VitePWA({
        // generateSW не даёт добавить свои push/notificationclick хендлеры — нужен свой sw.js (этап 9).
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        // Регистрацию делает client/src/realtime/push.ts после логина — не сразу при загрузке страницы.
        injectRegister: null,
        registerType: 'autoUpdate',
        manifest: {
          name: 'Qwill',
          short_name: 'Qwill',
          description: 'Мессенджер — чаты, группы, файлы',
          start_url: '/',
          display: 'standalone',
          background_color: '#eef1f6',
          theme_color: '#8c52ff',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          // API — отдельный origin (секция 6), в прекэш статики попадать не должен.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,json,jpg,woff2}'],
          // notification.html открывает только десктопная оболочка, где service worker
          // выключен вовсе (D-1), — в прекэше браузера ему делать нечего.
          globIgnores: [
            '**/wallpaper/patterns/*.svg',
            '**/download/album/*.jpg',
            '**/download/emoji.webp',
            'notification.html',
            'assets/notification-*.js',
            'assets/notification-*.css',
          ],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        // Без этого SW не обслуживается в `npm run dev` — пуши было бы нельзя проверить без сборки.
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    // .env лежит в корне монорепозитория — общий для сервера и клиента.
    // Отсюда приходит VITE_API_URL: клиент не предполагает общий origin с API (секция 6).
    envDir: repoRoot,
    resolve: {
      alias: {
        '@': path.resolve(here, 'src'),
      },
    },
    build: {
      rollupOptions: {
        // Вторая страница — плашка уведомления десктопной оболочки (D-13). Отдельным входом,
        // а не маршрутом внутри приложения: второе окно с полным клиентом означало бы второй
        // сокет и вторую сессию ради карточки на 88 пикселей.
        input: {
          main: path.resolve(here, 'index.html'),
          notification: path.resolve(here, 'notification.html'),
        },
      },
    },
    server: {
      // true = биндинг на все IPv4-интерфейсы (0.0.0.0), а не только на localhost/::1 —
      // так же снимает старую проблему Windows (`localhost` резолвится в ::1, часть
      // инструментов и Capacitor-эмулятор до дев-сервера не достучится: 127.0.0.1 как раз
      // среди адресов, на которые слушает 0.0.0.0), и вдобавок открывает доступ с телефона
      // и других устройств в той же LAN (см. CLAUDE.md, «Среда разработки (Windows)»).
      host: true,
      port: 5173,
      strictPort: true,
    },
  };
});
