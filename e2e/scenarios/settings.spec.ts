/**
 * Scenario spec: settings.
 *
 * Navigates to /settings and captures the full screen including the bottom
 * portion (BMC / thanks.dev badge, About card) with the floating tab bar in
 * frame, so the daily UX audit can detect any future regression where bottom
 * content is clipped by the floating tab bar.
 *
 * Does NOT require a seeded scenario — the settings screen is self-contained.
 * Skips onboarding via window.__SKIP_ONBOARDING__.
 *
 * Both a "top" and "bottom" scroll-position shot are captured:
 *   - "top"  : fresh page load, showing the upper settings cards
 *   - "bottom": scrolled to the end, showing BMC/thanks.dev/About cards above
 *               the floating tab bar (the regression surface from BLD-1106 /
 *               BLD-1124)
 *
 * Three CVD-emulated variants (deuteranopia / protanopia / tritanopia) are
 * also captured for the "bottom" shot via `captureWithCvd`.
 *
 * Refs: BLD-1106, BLD-1124
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "settings";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario settings", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  test("captures settings top (title + first cards)", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/settings");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const screenshotPath = path.join(OUT_DIR, "settings-top.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(screenshotPath).toBeTruthy();
  });

  test("captures settings bottom — BMC/About cards above floating tab bar", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/settings");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    // Scroll to the very bottom so the About / BMC badges are visible.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const viewport = "mobile";
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        viewport,
        capturedAt: new Date().toISOString(),
        note: "Bottom of settings — BMC/About section above floating tab bar (BLD-1124 regression surface)",
      },
    });
  });
});
