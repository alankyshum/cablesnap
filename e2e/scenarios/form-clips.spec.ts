/**
 * Scenario spec: form-clips.
 *
 * Uses the `app/__test__/form-clips.tsx` dev-only harness to render
 * FormLibraryTab in isolation on web, bypassing the Platform.OS !== "web"
 * guards via `window.__FORM_CLIPS_HARNESS__`. Asserts that the Record CTA
 * button is visible and enabled, then captures a screenshot.
 *
 * The harness receives a seed with one completed set and no existing clips
 * (recordTarget non-null, recordDisabledReason null), so the Record CTA is
 * enabled — this is the primary happy-path assertion for AC2a/AC5 of BLD-1105.
 *
 * Refs: BLD-1105, BLD-1123
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "form-clips";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

/** Seed that produces an enabled Record CTA (one set, no clips). */
const HARNESS_SEED = {
  exerciseId: "scenario-exercise-1",
  clips: [],
  recordTarget: {
    id: "scenario-fc-set-1",
    set_number: 1,
    completed_at: 1_700_000_000_000,
  },
  recordDisabledReason: null,
};

test.describe("@scenario form-clips", () => {
  // v1 mobile only.
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  test("Record CTA is visible and enabled in form-clips harness", async ({
    page,
  }) => {
    // Inject the harness seed before navigation so FormLibraryTab reads it.
    await page.addInitScript((seed) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__FORM_CLIPS_HARNESS__ = seed;
    }, HARNESS_SEED);

    await page.goto("/__test__/form-clips");

    // Wait for the harness to set testReady before asserting the CTA.
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // AC2a / AC5: Record CTA button is visible and enabled.
    const recordBtn = page.getByRole("button", {
      name: /record new form clip/i,
    });
    await expect(recordBtn).toBeVisible({ timeout: 5_000 });
    await expect(recordBtn).toBeEnabled();

    await page.waitForTimeout(500);

    const viewport = "mobile";
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        label: "form-clips-record-cta",
        route: "/__test__/form-clips",
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
      },
    });
  });
});

