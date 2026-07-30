import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export default defineConfig(() => {
  return {
    plugins: [react()],
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
