import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser accessibility gate for the editorial views.
 *
 * `npm run test:a11y` builds the bundle, starts `vite preview`, and runs the axe check at 320, 768
 * and 1280 px. The API is mocked inside the test, so no backend or database is needed.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
  },
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
