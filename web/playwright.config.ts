import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ja-JP',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // CI uses the Google Chrome that GitHub's Ubuntu image already has, so no browser download is needed there.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.CI && { channel: 'chrome' }), viewport: { width: 420, height: 860 } } }],
  webServer: {
    command: `npx vite --host localhost --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_FB_EMULATORS: '1',
      VITE_API_BASE: 'http://127.0.0.1:8787',
      VITE_FB_API_KEY: 'demo-api-key',
      VITE_FB_AUTH_DOMAIN: 'demo-monoshiri.firebaseapp.com',
      VITE_FB_PROJECT_ID: 'demo-monoshiri',
      VITE_FB_APP_ID: '1:000000000000:web:0000000000000000000000',
      VITE_FB_STORAGE_BUCKET: 'demo-monoshiri.appspot.com',
      VITE_FB_SENDER_ID: '000000000000',
      VITE_RECAPTCHA_KEY: '',
    },
  },
});
