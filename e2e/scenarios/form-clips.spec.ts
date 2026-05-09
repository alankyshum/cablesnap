/**
 * Scenario spec: form-clips.
 *
 * Seeds one exercise with a completed workout set via window.__TEST_SCENARIO__,
 * navigates to the exercise detail screen, and captures a screenshot of the
 * Form clips tab (including the Record CTA) at the `mobile` viewport.
 * Three CVD-emulated variants are also captured.
 *
 * The scenario seeds exercise `scenario-exercise-1` with one completed
 * `kind=workout` set and no existing form clips, so the Record CTA is
 * visible and enabled.
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

  test("captures Exercise Details — Form clips tab with Record CTA enabled", async ({
    page,
  }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, SCENARIO);

    await page.goto(`/exercise/${EXERCISE_ID}`);

    // Gate on seed completion.
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to Form clips tab.
    const formClipsTab = page.getByRole("tab", { name: /form clips/i });
    if (await formClipsTab.count()) {
      await formClipsTab.click();
    }

    await page.waitForTimeout(500);

    const viewport = "mobile";
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        label: "form-clips-record-cta",
        route: `/exercise/${EXERCISE_ID}`,
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
      },
    });
  });
});
