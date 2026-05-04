import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cross-env VITE_MSW=true pnpm --filter frontend dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: { VITE_MSW: 'true' },
  },
});