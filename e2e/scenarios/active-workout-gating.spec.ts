/**
 * Scenario spec: active-workout-gating.
 *
 * Verifies that the home active-workout banner renders correctly based on
 * `getActiveSession()` state:
 *   - Test A: in-progress session with zero completed sets → NO banner.
 *   - Test B: in-progress session with at least one completed set → banner.
 *
 * Refs: issue #3
 */
import { test, expect } from "@playwright/test";
import { enablePerWorkerDb } from "../helpers";

// const SCENARIO = "active-workout-gating";

test.describe("@scenario active-workout-gating", () => {
  // v1 mobile only.
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  // BLD-1791: per-worker DB isolation.
  test.beforeEach(async ({ page }, testInfo) => {
    await enablePerWorkerDb(page, testInfo.parallelIndex);
  });

  test("in-progress session with zero completed sets shows NO active banner", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, "active-gating-empty");

    await page.goto("/");

    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(500);

    // No completed sets → getActiveSession() returns null → no banner
    const banner = page.getByLabel(/Resume active workout:/);
    await expect(banner).toHaveCount(0);
  });

  test("in-progress session with a completed set shows the active banner", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, "active-gating-live");

    await page.goto("/");

    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(500);

    // Has a completed set → getActiveSession() returns Live Workout → banner
    await expect(
      page.getByLabel("Resume active workout: Live Workout"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
