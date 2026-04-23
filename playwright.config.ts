import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  globalTeardown: "./e2e/generate-manifest.ts",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",

  use: {
    baseURL: "http://localhost:8081",
    browserName: "chromium",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet",
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "store-pixel9",
      use: { viewport: { width: 412, height: 924 } },
    },
    {
      name: "store-fold7",
      use: { viewport: { width: 712, height: 853 } },
    },
  ],

  webServer: {
    // In CI (and anywhere E2E_USE_STATIC=1 is set) serve a pre-built static
    // bundle via `npx serve -s dist` instead of the Metro dev server. The
    // dev server's cold-start bundling time on a fresh CI runner exceeds
    // Playwright's per-test timeout and leaves the page blank (see BLD-517).
    command: process.env.E2E_USE_STATIC
      ? "npx --yes serve -s dist -l 8081"
      : "npx expo start --web --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
