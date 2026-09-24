import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'server/src/generated/**',
      'legacy/**',
      'design-archive/**',
      'client/android/**',
      'android/**',
      'desktop/renderer/**',
      'desktop/dist-release/**',
      'ds-bundle/**',
      '.ds-sync/**',
      '.design-sync/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Service worker — свой глобальный контекст (self = ServiceWorkerGlobalScope, не window), этап 9.
    files: ['client/src/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        MessageChannel: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'desktop/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // Не запускается в Node: текст этого файла инжектируется в WebView через CDP
    // (`scripts/seed-media.mjs`, `client.evaluate(PAGE_SOURCE)`) — свой глобальный контекст,
    // как у service worker выше.
    files: ['scripts/seed-media.page.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        Blob: 'readonly',
        WebSocket: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
);
