import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      VitePWA({
        // generateSW не даёт добавить свои push/notificationclick хендлеры — нужен свой sw.js (этап 9).
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        // Регистрацию делает client/src/realtime/push.ts после логина — не сразу при загрузке страницы.
        injectRegister: null,
        registerType: 'autoUpdate',
        manifest: {
          name: 'Messenger',
          short_name: 'Messenger',
          description: 'Мессенджер — чаты, группы, файлы',
          start_url: '/',
          display: 'standalone',
          background_color: '#f6f4fb',
          theme_color: '#8c52ff',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          // API — отдельный origin (секция 6), в прекэш статики попадать не должен.
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
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
    server: {
      // Явный IPv4: на Windows `localhost` резолвится в ::1, и часть инструментов
      // (и Capacitor-эмулятор) до dev-сервера не достучится.
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
  };
});
