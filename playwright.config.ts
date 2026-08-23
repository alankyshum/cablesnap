import { defineConfig } from "@playwright/test";
import * as path from "path";

const PORT = process.env.PLAYWRIGHT_PORT || "8088";
const BASE_URL = `http://localhost:${PORT}`;
const E2E_WEB_DIST = path.resolve(__dirname, `.expo/e2e-web-${PORT}`);
const SERVE_CONFIG = path.resolve(__dirname, "e2e/serve-coop-coep.json");

// Never use shared dist/: Android exports can overwrite the web artifact, and
// stale artifacts can make Playwright exercise another build. Every run owns a
// port-scoped web export, including CI.
const staticServerCommand = `node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" '${E2E_WEB_DIST}' && npx expo export -p web --output-dir '${E2E_WEB_DIST}' && npx serve -s '${E2E_WEB_DIST}' -l ${PORT} -c '${SERVE_CONFIG}'`;

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
    // Always serve a static bundle for Playwright. Local runs build into a
    // port-scoped isolated directory; CI serves the bundle explicitly
    // prepared by its workflow. A shared dist/ is unsafe because Android
    // exports can overwrite the web artifact (see BLD-517).
    //
    // BLD-658: scenario specs need `crossOriginIsolated === true` so the
    // expo-sqlite Web Worker can use SharedArrayBuffer; otherwise
    // `useAppInit` short-circuits via `webNeedsUnsupportedFallback` and the
    // scenario seed never runs (no `data-test-ready` flag). The serve
    // config sets COOP/COEP/CORP headers; the absolute path is required
    // because `serve --config` resolves relative to the served folder.
    command: staticServerCommand,
    url: BASE_URL,
    // Never accept an arbitrary process already bound to the test port. A stale
    // Metro/serve instance can otherwise make Playwright exercise another
    // checkout or an obsolete bundle while reporting this config as healthy.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
