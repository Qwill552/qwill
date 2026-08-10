import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));

/** E2E-тесты гоняются против настоящего dev-стека (shared+server+client), см. STAGES.md, этап 10-A. */
export default defineConfig({
  testDir: './e2e',
  testIgnore: 'offline.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'https://127.0.0.1:5173',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'https://127.0.0.1:5173',
    ignoreHTTPSErrors: true,
    cwd: here,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
