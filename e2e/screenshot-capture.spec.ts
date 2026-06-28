/**
 * Screenshot capture for pixelslop visual review.
 *
 * Navigates to every registered screen at each viewport size and saves
 * a full-page screenshot to `.pixelslop/screenshots/`.
 *
 * Manifest generation is handled by the globalTeardown script
 * (e2e/generate-manifest.ts) which runs AFTER all workers finish,
 * scanning the screenshots directory to build manifest.json from
 * the actual files on disk -- avoiding the cross-worker state bug.
 *
 * Screenshots are generated artifacts -- they are gitignored and
 * regenerated on each run (old files are cleaned up first).
 */
import { test, expect, type Page } from "@playwright/test";
import { skipOnboarding, navigateTo, enablePerWorkerDb } from "./helpers";
import * as fs from "fs";
import * as path from "path";
import {
  ALL_SCREENS,
  ONBOARDING_SCREENS,
  STORE_SCREENS,
  type Screen,
  slugify,
} from "./screen-registry";

const SCREENSHOT_DIR = path.resolve(__dirname, "../.pixelslop/screenshots");

function getDateStamp(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function dismissErrorOverlay(page: Page): Promise<void> {
  try {
    const closeBtn = page.locator('[aria-label="Close"], button:has-text("×"), button:has-text("Dismiss")');
    if (await closeBtn.first().isVisible({ timeout: 500 })) {
      await closeBtn.first().click();
      await page.waitForTimeout(300);
    }
  } catch { /* no overlay */ }
}

async function captureScreen(
  page: Page,
  screen: Screen,
  viewport: string,
  dateStamp: string,
  fullPage = true,
) {
  const slug = slugify(screen.name);
  const filename = `${slug}-${viewport}-${dateStamp}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);

  try {
    await navigateTo(page, screen.path);
    await page.waitForTimeout(2000);
    await dismissErrorOverlay(page);
    await page.screenshot({ path: filepath, fullPage });
  } catch (err) {
    console.warn(
      `Screenshot skipped for ${screen.name} at ${viewport}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe("Screenshot Capture -- All Screens", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  for (const screen of ALL_SCREENS) {
    test(`capture ${screen.name}`, async ({ page }, testInfo) => {
      const viewport = testInfo.project.name;
      const dateStamp = getDateStamp();
      await captureScreen(page, screen, viewport, dateStamp);
    });
  }
});

test.describe("Screenshot Capture -- Onboarding", () => {
  for (const screen of ONBOARDING_SCREENS) {
    test(`capture ${screen.name}`, async ({ page }, testInfo) => {
      const viewport = testInfo.project.name;
      const dateStamp = getDateStamp();

      await page.goto(screen.path);
      await page.waitForTimeout(1000);

      const slug = slugify(screen.name);
      const filename = `${slug}-${viewport}-${dateStamp}.png`;
      const filepath = path.join(SCREENSHOT_DIR, filename);

      try {
        await page.screenshot({ path: filepath, fullPage: true });
      } catch (err) {
        console.warn(
          `Screenshot skipped for ${screen.name} at ${viewport}: ${err instanceof Error ? err.message : err}`,
        );
      }
    });
  }
});

test.describe("Screenshot Capture -- Store", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("store-"),
      "Only runs on store-* projects",
    );
    await enablePerWorkerDb(page, testInfo.parallelIndex);
  });

  for (const screen of STORE_SCREENS) {
    test(`store capture ${screen.name}`, async ({ page }, testInfo) => {
      const viewport = testInfo.project.name;
      const dateStamp = getDateStamp();
      const slug = slugify(screen.name);
      const filename = `${slug}-${viewport}-${dateStamp}.png`;
      const filepath = path.join(SCREENSHOT_DIR, filename);

      await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        w.__SKIP_ONBOARDING__ = true;
        w.__TEST_SCENARIO__ = "store-showcase";
      });

      await page.goto(screen.path);

      await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
        timeout: 15_000,
      });
      // Assert no dev error overlay is present (catches SQLite/CanvasKit crashes on wide viewports).
      await expect(page.getByText("Uncaught Error")).toHaveCount(0);
      await page.waitForTimeout(500);

      await page.screenshot({ path: filepath, fullPage: false });
    });
  }
});
