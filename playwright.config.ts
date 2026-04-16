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
  ],

  webServer: {
    command: "npx expo start --web --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
