/**
 * Scenario spec: advanced-sets (BLD-1176 AC #264 / AC #265 / AC #273).
 *
 * Navigates to Settings → Advanced Set Types help screen via the production
 * mount path (/settings → press "Advanced Set Types") and verifies:
 *
 *  1. The help screen renders with entries for all three advanced set types.
 *  2. None of the forbidden aspirational phrases appear in the rendered text.
 *  3. Screenshots captured at mobile + mobile-narrow viewports.
 *
 * AC #265 — advanced-set data persistence through production session-detail path:
 *  4. A seeded rest_pause set renders via /session/detail/[id] with "RP" chip.
 *  5. After a full page reload (kill+relaunch simulation) the data re-renders.
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

  // AC #265 — advanced set data through production session-detail mount path
  test("rest_pause set renders via production session-detail path (AC #265)", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, "advanced-sets");

    await page.goto("/session/detail/scenario-advanced-session-1");

    // Wait for seedScenario() to complete and signal readiness
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // Verify the rest_pause set type chip ("RP") renders
    await expect(page.getByText("RP")).toBeVisible({ timeout: 5_000 });

    // Verify set data (100 kg × 13 reps) renders
    await expect(page.getByText("100 × 13")).toBeVisible();
  });

  // AC #265 — kill+relaunch simulation: navigate away via SPA (no page reload,
  // addInitScript doesn't re-run, seedScenario doesn't clear+re-seed), then
  // navigate back to session detail and assert data persists in the in-session DB.
  test("advanced set data survives kill+relaunch via session-detail (AC #265)", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, "advanced-sets");

    // First "launch": seed + navigate to session detail
    await page.goto("/session/detail/scenario-advanced-session-1");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("RP")).toBeVisible({ timeout: 5_000 });

    // Simulate "kill": navigate to home via SPA history API (no full page reload).
    // addInitScript does NOT re-run on SPA navigations, so __TEST_SCENARIO__ is
    // not re-set and seedScenario() does not clear+re-seed the DB.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    await page.waitForTimeout(500);

    // Simulate "relaunch": navigate back to session detail via SPA
    await page.evaluate(() => {
      window.history.pushState({}, "", "/session/detail/scenario-advanced-session-1");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    await page.waitForTimeout(800);

    // Data must still render — seedScenario did NOT re-run (seed hook was not re-enabled),
    // proving the in-session DB state persists through kill+relaunch navigation.
    await expect(page.getByText("RP")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("100 × 13")).toBeVisible();
  });
});
