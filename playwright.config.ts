import { defineConfig } from "@playwright/test";
import * as path from "path";

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
      name: "mobile-narrow",
      // 320×640 — SE-class smallest first-party device. Triggers the
      // `truncateChipLabel` branch in SessionHeaderToolbar below 360dp.
      // Scoped to the adaptive-rest scenario; other specs skip via project name.
      use: { viewport: { width: 320, height: 640 } },
    },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile-large",
      // 430×932 — iPhone 14/15 Pro Max. Scoped to the adaptive-rest scenario;
      // other specs skip via project name.
      use: { viewport: { width: 430, height: 932 } },
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
    //
    // BLD-658: scenario specs need `crossOriginIsolated === true` so the
    // expo-sqlite Web Worker can use SharedArrayBuffer; otherwise
    // `useAppInit` short-circuits via `webNeedsUnsupportedFallback` and the
    // scenario seed never runs (no `data-test-ready` flag). The serve
    // config sets COOP/COEP/CORP headers; the absolute path is required
    // because `serve --config` resolves relative to the served folder.
    command: process.env.E2E_USE_STATIC
      ? `npx --yes serve -s dist -l 8081 -c ${path.resolve(__dirname, "e2e/serve-coop-coep.json")}`
      : "npx expo start --web --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
