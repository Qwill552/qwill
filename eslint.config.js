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
      globals: { self: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
);
