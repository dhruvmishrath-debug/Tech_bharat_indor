import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
process.env.PLANNER ??= 'rules'; // the 63-test suite is deterministic and offline; use `npm run test:llm` for a real local model

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js', // rebuilds reports/dashboard/index.html
  // Healing runs share a plan store (.selfheal/), so they run serially, in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on',                  // full trace of every healing run, viewable in the HTML report
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite build --logLevel warn && node engine/serve.js', // always test the current React code,
    url: `http://127.0.0.1:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
