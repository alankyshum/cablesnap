import { defineConfig } from "@playwright/test";
import * as path from "path";

const PORT = process.env.PLAYWRIGHT_PORT || "8088";
const BASE_URL = `http://localhost:${PORT}`;
const E2E_WEB_DIST = path.resolve(__dirname, `.expo/e2e-web-${PORT}`);
const SERVE_CONFIG = path.resolve(__dirname, "e2e/serve-coop-coep.json");

const staticServerCommand = process.env.CI
  // CI intentionally prepares dist itself: scenario jobs use a dev export so
  // __DEV__-guarded seed hooks remain present, while snapshot jobs may choose a
  // production export. Keep serving exactly the artifact the workflow built.
  ? `npx serve -s dist -l ${PORT} -c '${SERVE_CONFIG}'`
  // Local runs must not trust a shared/stale dist directory. Web and Android
  // exports both default to dist, and an Android export leaves a valid-looking
  // index.html with no web entry script. Build into a port-scoped directory.
  : `node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" '${E2E_WEB_DIST}' && npx expo export -p web --output-dir '${E2E_WEB_DIST}' && npx serve -s '${E2E_WEB_DIST}' -l ${PORT} -c '${SERVE_CONFIG}'`;

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
    baseURL: BASE_URL,
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
    // In CI (and anywhere E2E_USE_STATIC=1 is set) use a static bundle instead
    // of the Metro dev server. Local runs build into an isolated directory;
    // CI serves the bundle explicitly prepared by its workflow. The
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
      ? staticServerCommand
      : `npx expo start --web --port ${PORT}`,
      url: BASE_URL,
    // Never accept an arbitrary process already bound to the test port. A stale
    // Metro/serve instance can otherwise make Playwright exercise another
    // checkout or an obsolete bundle while reporting this config as healthy.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
