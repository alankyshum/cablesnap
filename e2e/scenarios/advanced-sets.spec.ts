/**
 * Scenario spec: advanced-sets (BLD-1176 AC #264 / AC #273).
 *
 * Navigates to Settings → Advanced Set Types help screen via the production
 * mount path (/settings → press "Advanced Set Types") and verifies:
 *
 *  1. The help screen renders with entries for all three advanced set types.
 *  2. None of the forbidden aspirational phrases appear in the rendered text.
 *  3. Screenshots captured at mobile + mobile-narrow viewports.
 *
 * Scope note on AC #265 (kill+relaunch data persistence): AC #265 is about
 * advanced set DATA (rest-pause segments) surviving app kill+relaunch through
 * the production session-detail path. That coverage belongs to BLD-1175
 * (Slice 7 — mini-set editor + live logging). This spec verifies only that
 * the help-screen route survives a page reload (static content, no DB state).
 *
 * Refs: BLD-1168, BLD-1176.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const SCENARIO = "advanced-sets";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

const FORBIDDEN_PHRASES = [
  "advanced lifters",
  "next level",
  "unlock",
  "serious lifters",
  "take your training to",
];

test.describe("@scenario advanced-sets", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !["mobile", "mobile-narrow"].includes(testInfo.project.name),
      "advanced-sets spec: mobile and mobile-narrow viewports only",
    );
  });

  test("help screen renders all three advanced set type entries", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    // Navigate via production mount path: /settings → tap "Advanced Set Types"
    await page.goto("/settings");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);

    const helpLink = page.getByText("Advanced Set Types").first();
    await expect(helpLink).toBeVisible({ timeout: 5_000 });
    await helpLink.tap();

    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // Verify all three set types render
    await expect(page.getByText("Rest-pause")).toBeVisible();
    await expect(page.getByText("Cluster")).toBeVisible();
    await expect(page.getByText("Myo-reps")).toBeVisible();
  });

  test("help copy contains no forbidden aspirational phrases", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/settings/advanced-sets");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const bodyText = await page.locator("body").innerText();
    const lowerText = bodyText.toLowerCase();

    for (const phrase of FORBIDDEN_PHRASES) {
      expect(lowerText).not.toContain(phrase);
    }
  });

  test("help screen route survives page reload (static route stability)", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    // First load
    await page.goto("/settings/advanced-sets");
    await expect(page.getByText("Rest-pause")).toBeVisible({ timeout: 15_000 });

    // Simulate kill + relaunch: reload the page and navigate directly to the route
    await page.reload();
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });
    await page.goto("/settings/advanced-sets");
    await expect(page.getByText("Rest-pause")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Cluster")).toBeVisible();
    await expect(page.getByText("Myo-reps")).toBeVisible();

    // Capture screenshot
    const viewport = testInfo.project.name;
    const screenshotPath = path.join(OUT_DIR, `advanced-sets-help-${viewport}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(screenshotPath).toBeTruthy();
  });
});
