import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30000,

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

  webServer: [
    {
      command: 'pnpm --filter @neofilm/api run dev',
      port: 3001,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter @neofilm/web-admin run dev',
      port: 3000,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
