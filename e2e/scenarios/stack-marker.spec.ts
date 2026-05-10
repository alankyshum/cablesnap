/**
 * Scenario spec: stack-marker (BLD-1126 AC10).
 *
 * Uses the `app/__test__/stack-marker.tsx` dev-only harness to render
 * StackMarkerPill in isolation, seeded via `window.__STACK_MARKER_HARNESS__`.
 *
 * Exercises (AC10):
 *  1. Pristine pill renders "Pick marker" (AC1 — pristine state).
 *  2. Tap the pill → simulates MarkerPickerSheet.onConfirm → pill transitions
 *     to marker-logged state: "<marker> · <weight> <unit>" (AC1 + AC3).
 *  3. body[data-confirmed-marker] attribute matches expected marker (AC3).
 *  4. Screenshots captured at mobile + mobile-narrow viewports.
 *
 * The harness bypasses the live MarkerPickerSheet (a native bottom-sheet) to
 * keep the test deterministic on web Playwright. The commit flow is verified
 * by the onPress→setState path which is the same code path called by
 * MarkerPickerSheet.onConfirm in production.
 *
 * Refs: BLD-1126, BLD-1127.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "stack-marker";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

const HARNESS_SEED = {
  markerResult: {
    marker: 6,
    weight: 60,
    unit: "kg",
  },
};

test.describe("@scenario stack-marker", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !["mobile", "mobile-narrow"].includes(testInfo.project.name),
      "AC10: mobile and mobile-narrow viewports only",
    );
  });

  test("pristine pill renders 'Pick marker', tap commits marker-logged state", async ({
    page,
  }) => {
    await page.addInitScript((seed) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__STACK_MARKER_HARNESS__ = seed;
    }, HARNESS_SEED);

    await page.goto("/__test__/stack-marker");

    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    const pill = page.getByTestId("stack-marker-pill");
    await expect(pill).toBeVisible({ timeout: 5_000 });

    // AC1 — pristine state: label is "Pick marker"
    await expect(pill).toHaveText("Pick marker");

    const viewport = page.viewportSize()?.width === 375 ? "mobile" : "mobile-narrow";
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        label: `stack-marker-pristine-${viewport}`,
        route: "/__test__/stack-marker",
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
      },
    });

    // AC3 — click the pill to commit the marker (tap() requires hasTouch context;
    // RN-Web maps onPress to mousedown/click so click() is equivalent)
    await pill.click();

    // AC1 — marker-logged state: label is "<marker> · <weight> <unit>"
    await expect(pill).toHaveText("6 · 60 kg");

    // AC3 — body data attr confirms the persisted marker value
    await expect(
      page.locator("body[data-confirmed-marker='6']"),
    ).toBeVisible({ timeout: 3_000 });

    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        label: `stack-marker-committed-${viewport}`,
        route: "/__test__/stack-marker",
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
      },
    });
  });
});
