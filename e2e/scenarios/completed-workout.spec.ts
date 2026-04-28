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
 * Refs: BLD-494, BLD-481, BLD-744
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

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
