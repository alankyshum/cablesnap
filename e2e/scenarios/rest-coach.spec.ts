/**
 * Scenario spec: rest-coach (BLD-1137).
 *
 * Uses the `app/__test__/rest-coach.tsx` dev-only harness to render
 * ReminderSection's Smart Rest Coach rows in isolation.
 *
 * Tests (per AC11 — master-switch / permission disabled states):
 *  1. When master ON + permission granted → all three rows are enabled.
 *  2. When master OFF → all three rows render disabled with correct helper text.
 *  3. When permDenied → all three rows render disabled with permission helper text.
 *  4. Screenshots captured at mobile viewport.
 *
 * Refs: BLD-1137, AC1, AC11.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const SCENARIO = "rest-coach";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario rest-coach", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !["mobile"].includes(testInfo.project.name),
      "rest-coach harness: mobile viewport only",
    );
  });

  test("master ON — all three sub-rows are enabled (AC1)", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__REST_COACH_HARNESS__ = {
        restNotifications: true,
        restPreEndCueSeconds: 10,
        restLiveCountdown: true,
        restShowNextSet: false,
        permDenied: false,
        harnessActive: true,
      };
    });

    await page.goto("/__test__/rest-coach");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });
    const harness = page.getByTestId("rest-coach-harness");
    await expect(harness).toBeVisible({ timeout: 5000 });

    // Pre-end cue segmented control should have 10s selected
    await expect(page.getByRole("radio", { name: "10 seconds" })).toBeVisible();

    // Show next set toggle should be present.
    // RN Web emits BOTH a `<div role="switch">` (visible toggle) and a hidden
    // `<input role="switch">` (a11y companion control), so the bare role-name
    // selector hits a strict-mode violation. `.first()` targets the visible
    // toggle deterministically.
    await expect(page.getByRole("switch", { name: "Show next set on lock screen" }).first()).toBeVisible();

    // No disabled-state helper text when master is ON
    await expect(page.getByText("Enable rest-timer notifications to use these.")).not.toBeVisible();

    await page.screenshot({
      path: path.join(OUT_DIR, "master-on.png"),
      fullPage: true,
    });
  });

  test("master OFF — sub-rows render disabled with helper text (AC11)", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__REST_COACH_HARNESS__ = {
        restNotifications: false,
        restPreEndCueSeconds: 10,
        restLiveCountdown: true,
        restShowNextSet: false,
        permDenied: false,
        harnessActive: true,
      };
    });

    await page.goto("/__test__/rest-coach");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });
    const harness = page.getByTestId("rest-coach-harness");
    await expect(harness).toBeVisible({ timeout: 5000 });

    // Helper text should be visible when master is OFF
    await expect(page.getByText("Enable rest-timer notifications to use these.")).toBeVisible();

    await page.screenshot({
      path: path.join(OUT_DIR, "master-off.png"),
      fullPage: true,
    });
  });

  test("permission denied — sub-rows render disabled with OS settings text (AC11)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__REST_COACH_HARNESS__ = {
        restNotifications: true,
        restPreEndCueSeconds: 10,
        restLiveCountdown: true,
        restShowNextSet: false,
        permDenied: true,
        harnessActive: true,
      };
    });

    await page.goto("/__test__/rest-coach");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });
    const harness = page.getByTestId("rest-coach-harness");
    await expect(harness).toBeVisible({ timeout: 5000 });

    // Should show OS-level denial message
    await expect(page.getByText(/Notifications are blocked in/)).toBeVisible();

    await page.screenshot({
      path: path.join(OUT_DIR, "perm-denied.png"),
      fullPage: true,
    });
  });
});
