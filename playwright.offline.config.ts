import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));

const PHONE_VIEWPORT = { width: 420, height: 900 };

export default defineConfig({
  testDir: './e2e',
  testMatch: 'offline.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'https://127.0.0.1:5174',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: PHONE_VIEWPORT },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w @messenger/server',
      url: 'https://127.0.0.1:3000/api/health',
      ignoreHTTPSErrors: true,
      cwd: here,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run preview -w @messenger/client -- --port 5174 --strictPort',
      url: 'https://127.0.0.1:5174',
      ignoreHTTPSErrors: true,
      cwd: here,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
