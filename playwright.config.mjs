import { defineConfig, devices } from '@playwright/test';

// BASE_URL=https://… npx playwright test   (defaults to a local wrangler dev on 8799)
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:8799', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, grep: /@phone/ },
  ],
});
