/**
 * Scenario spec: form-clips.
 *
 * Seeds one custom exercise ("Scenario Exercise") with one completed workout
 * set via window.__TEST_SCENARIO__, navigates to the exercise detail screen,
 * and captures the exercise detail page at the `mobile` viewport.
 *
 * NOTE: The Form clips tab (FormLibraryTab / Record CTA) is rendered ONLY on
 * native — ExerciseDetailDrawer.tsx gates `showClipsTab` on
 * `Platform.OS !== "web"` (AC16 of BLD-1105). Playwright runs against the web
 * export, so the tab is not present here by design. This scenario instead
 * captures the exercise detail page — the host surface for Form clips on
 * native — so the daily audit detects layout regressions on that screen.
 *
 * The seeded exercise has `is_custom = 1`, so the "Custom" chip is
 * deterministically visible and used as the gate assertion.
 *
 * Refs: BLD-1105, BLD-1123
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "form-clips";
const EXERCISE_ID = "scenario-exercise-1";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario form-clips", () => {
  // v1 mobile only.
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  test("captures Exercise Details page — host surface for Form clips on native", async ({
    page,
  }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, SCENARIO);

    await page.goto(`/exercise/${EXERCISE_ID}`);

    // Gate on seed completion before capturing.
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // Assert the seeded exercise page has loaded — "Custom" chip is
    // deterministically present because is_custom=1 in the seed.
    // This is a hard assertion (no optional guard) so the spec fails
    // explicitly if the exercise page doesn't render.
    await expect(page.getByText("Custom").first()).toBeVisible({ timeout: 5_000 });

    await page.waitForTimeout(500);

    const viewport = "mobile";
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        label: "exercise-detail-form-clips-host",
        route: `/exercise/${EXERCISE_ID}`,
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
      },
    });
  });
});
