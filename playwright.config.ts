import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3001);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: an API suite should be deterministic. A retry would hide a
  // flaky endpoint or a race condition instead of reporting it.
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  projects: [
    // Phase 1: tests that read the whole seeded room list. Nothing else runs
    // alongside them, so the list can't change under their feet.
    { name: 'catalogue', testMatch: /catalogue\/.*\.spec\.ts/ },
    // Phase 2: everything else, fully parallel. These tests create their own
    // rooms and bookings, which would make a shared list unstable.
    { name: 'api', testIgnore: /catalogue\//, dependencies: ['catalogue'] },
  ],
  webServer: process.env.BASE_URL
    ? undefined // pointing at an already-running environment
    : {
        command: 'npm run start:test',
        url: `${BASE_URL}/health`,
        reuseExistingServer: !process.env.CI,
        env: { PORT: String(PORT) },
        timeout: 30_000,
      },
});
