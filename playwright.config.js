import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node scripts/dev-server.js 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 15_000
  }
});
