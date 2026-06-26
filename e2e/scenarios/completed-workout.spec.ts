/**
 * Scenario spec: completed-workout.
 *
 * Seeds one completed session via window.__TEST_SCENARIO__, navigates to the
 * post-workout summary screen, and captures a screenshot at the `mobile`
 * Playwright project viewport (v1 is mobile-only per TL#4). Each scenario
 * also captures three CVD-emulated variants (deuteranopia / protanopia /
 * tritanopia) via the helper in `./capture-with-cvd.ts` (BLD-744).
 *
 * The seeded session id is pinned in `lib/db/test-seed.ts#seedCompletedWorkout`
 * as `scenario-session-1`, so this spec can navigate directly to the summary
 * route without first reading the DB.
 *
 * Refs: BLD-494, BLD-481, BLD-744, BLD-1942
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";
import { enablePerWorkerDb } from "../helpers";

const SCENARIO = "completed-workout";
const SESSION_ID = "scenario-session-1";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario completed-workout", () => {
  // v1 mobile only — skip on other Playwright projects to keep vision cost bounded.
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  // BLD-1791: per-worker DB isolation so this spec's seedScenario() table-clear
  // can't race a sibling DB-touching spec on the shared `cablesnap.db`.
  test.beforeEach(async ({ page }, testInfo) => {
    await enablePerWorkerDb(page, testInfo.parallelIndex);
  });

  test("captures post-workout summary screen", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, SCENARIO);

    await page.goto(`/session/summary/${SESSION_ID}`);

    // The seed hook flips <body data-test-ready="true"> AFTER clear+reseed.
    // Gate capture on it to avoid pre-seed flicker.
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(500);

    // Scroll the inner React Native FlatList (not the document) to the bottom
    // so below-fold content (Estimated pacing card, Sets card, action buttons)
    // is captured. window.scrollTo() does not move RN's scroll container —
    // scroll the testID element directly (same fix as settings.spec.ts BLD-1124).
    // BLD-1768 root cause: FlatList never scrolled, pacing-card clipped at bottom.
    // BLD-1942: wait for the FlatList to appear before scrolling — useSummaryData
    // may still be loading the session (seed runs concurrently with the first DB
    // read; if the hook fired before the seed, session was null and the FlatList
    // didn't render yet). data-test-ready only signals seed completion, not
    // React state hydration.
    const scrollEl = page.getByTestId("summary-scroll-view");
    await expect(scrollEl).toBeVisible({ timeout: 10_000 });
    await scrollEl.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    // scrollIntoViewIfNeeded as a surgical follow-up to guarantee pacing-card
    // is actually visible regardless of content height variation.
    const pacingCard = page.getByTestId("pacing-card");
    await pacingCard.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(200);

    // Assert the Working/Rest/Other legend (pacing-card) is in the viewport
    // BEFORE capturing, so a genuine future cutoff regression still fails the test.
    await expect(pacingCard).toBeInViewport({ timeout: 5000 });

    const viewport = "mobile";
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        label: "post-workout-summary",
        route: `/session/summary/${SESSION_ID}`,
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
      },
    });
  });
});
