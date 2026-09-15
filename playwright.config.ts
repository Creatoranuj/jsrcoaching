import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Sadhguru Coaching Centre E2E Tests
 * Run: npx playwright test
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 12"] },
    },
    {
      // Closer to typical Sadguru Coaching Classes user device (Android 13+, large screen)
      name: "android-pixel7",
      use: { ...devices["Pixel 7"] },
    },
    {
      // iOS modern device profile for App Store readiness checks
      name: "ios-iphone14",
      use: { ...devices["iPhone 14"] },
    },
  ],

  webServer: {
    // Serve the built app through the production Express server instead of the
    // Vite dev middleware. On a cold 2-core CI runner, the first request to the
    // dev server blocks on Vite's dep pre-bundling/transform and can exceed the
    // 120s readiness window (the "Timed out waiting from config.webServer"
    // failure). The static production server has no transform step, so it
    // becomes ready in ~1s and matches what users actually run.
    // `npm run build` is skipped when dist/ already exists (CI builds it in a
    // prior step); a local `playwright test` builds once on demand.
    command: "[ -f dist/index.html ] || npm run build; PORT=8080 npm run start",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },

});
