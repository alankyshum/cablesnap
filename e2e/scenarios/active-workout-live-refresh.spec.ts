/**
 * Scenario spec: active-workout-live-refresh.
 *
 * Verifies that completing the first set of an in-progress session makes the
 * home active-workout banner appear when returning to the home tab via
 * client-side SPA navigation (no full page reload).
 *
 * The test avoids `page.goto()` for the return leg because that triggers a
 * full page reload which re-seeds the DB (the seed clears `workout_sets` and
 * `workout_sessions`). Instead, it uses `history.pushState` + synthetic
 * `PopStateEvent` to navigate the SPA client-side, preserving the DB state
 * so the completed set is still present when `getActiveSession()` runs.
 *
 * This exercises the `bumpQueryVersion("home")` + `invalidateQueries(["home"])`
 * path in `handleCheck` (useSessionActions.ts) followed by the
 * `useFocusRefetch(["home", "gtg-today"])` invalidation in the home tab.
 *
 * Refs: issue #4
 */
import { test, expect } from "@playwright/test";
import { enablePerWorkerDb } from "../helpers";

// const SCENARIO = "active-workout-live-refresh";

test.describe("@scenario active-workout-live-refresh", () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  test.beforeEach(async ({ page }, testInfo) => {
    await enablePerWorkerDb(page, testInfo.parallelIndex);
  });

  test("completing first set makes the home active banner appear after returning without reload", async ({
    page,
  }) => {
    // ── Step 1: home, precondition ──────────────────────────────────
    // Seed: in-progress session with zero completed sets → no banner.
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

    // precondition: no banner
    const banner = page.getByLabel(/Resume active workout:/);
    await expect(banner).toHaveCount(0);

    // ── Step 2: open the session page and complete the first set ───
    // `page.goto()` triggers a full load; the seed re-runs BUT under the same
    // scenario ("active-gating-empty") so the session + uncompleted set are
    // recreated identically.
    await page.goto(`/session/scenario-active-empty-1`);

    // Wait for the check-circle control to appear (SetRow renders it).
    const markBtn = page.getByLabel("Mark set 1 complete");
    await expect(markBtn).toBeVisible({ timeout: 15_000 });

    // Tap the set-complete checkbox (click, not tap, per e2e convention).
    await markBtn.click();

    // Let the optimistic DOM update + DB write + home-query invalidation settle.
    await page.waitForTimeout(800);

    // Verify the completion was applied (label toggles to "incomplete").
    await expect(
      page.getByLabel("Mark set 1 incomplete"),
    ).toBeVisible({ timeout: 5_000 });

    // ── Step 3: return to home via client-side SPA navigation ──────
    // Use history.pushState + synthetic PopStateEvent so expo-router
    // navigates client-side WITHOUT a full page reload.  This preserves
    // the completed set in the DB.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // The home tab re-gains focus → useFocusRefetch(["home", "gtg-today"])
    // fires → version has changed since handleCheck bumped it → home query
    // is invalidated → loadHomeData re-runs → getActiveSession() returns
    // the session (it now has a completed set) → HomeBanners renders.
    await expect(
      page.getByLabel(/Resume active workout:/),
    ).toBeVisible({ timeout: 15_000 });
  });
});
