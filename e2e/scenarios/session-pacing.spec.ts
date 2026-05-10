/**
 * Scenario spec: session-pacing (BLD-1144).
 *
 * Uses the `app/__test__/session-pacing.tsx` dev-only harness to render
 * PacingCard in isolation with seeded pacing data.
 *
 * Tests:
 *  1. PacingCard renders with literal title "Estimated pacing" (AC§134)
 *  2. Segment labels "Working", "Rest", "Other" are visible (AC§134)
 *  3. Tapping the card body opens the per-exercise breakdown sheet (AC§137)
 *  4. Screenshot captured at mobile viewport.
 *
 * Refs: BLD-1144, BLD-1124 convention (mobile-only, no per-scenario opt-in for extra viewports).
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const SCENARIO = "session-pacing";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

/** Sample pacing breakdown for the harness. */
const SAMPLE_PACING = {
  working: 1122, // 18:42
  rest: 2470,   // 41:10
  other: 428,   // 7:08
  gross: 4020,  // total ~67 min
  isEmpty: false,
  perExercise: [
    { exercise_id: "ex1", working: 252, rest: 585, other: 150 },
    { exercise_id: "ex2", working: 238, rest: 680, other: 68 },
    { exercise_id: "ex3", working: 156, rest: 360, other: 30 },
    { exercise_id: "ex4", working: 476, rest: 845, other: 180 },
  ],
};

test.describe("@scenario session-pacing", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !["mobile"].includes(testInfo.project.name),
      "session-pacing harness: mobile viewport only (BLD-1124 convention)",
    );
  });

  test("PacingCard renders with literal title and segment labels (AC§134)", async ({ page }) => {
    await page.addInitScript((pacing) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__SESSION_PACING_HARNESS__ = {
        harnessActive: true,
        pacing,
        exerciseNames: {
          ex1: "Cable Row",
          ex2: "Lat Pulldown",
          ex3: "Face Pull",
          ex4: "Bodyweight Dips",
        },
      };
    }, SAMPLE_PACING);

    await page.goto("/__test__/session-pacing");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });

    const harness = page.getByTestId("session-pacing-harness");
    await expect(harness).toBeVisible({ timeout: 5000 });

    // Title literal
    await expect(page.getByText("Estimated pacing")).toBeVisible();

    // Segment labels
    await expect(page.getByText(/Working/).first()).toBeVisible();
    await expect(page.getByText(/Rest/).first()).toBeVisible();
    await expect(page.getByText(/Other/).first()).toBeVisible();

    // PacingCard testID
    await expect(page.getByTestId("pacing-card")).toBeVisible();

    await page.screenshot({
      path: path.join(OUT_DIR, "pacing-card.png"),
      fullPage: true,
    });
  });

  test("tapping PacingCard body opens breakdown sheet with per-exercise table (AC§137)", async ({ page }) => {
    await page.addInitScript((pacing) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__SESSION_PACING_HARNESS__ = {
        harnessActive: true,
        pacing,
        exerciseNames: {
          ex1: "Cable Row",
          ex2: "Lat Pulldown",
          ex3: "Face Pull",
          ex4: "Bodyweight Dips",
        },
      };
    }, SAMPLE_PACING);

    await page.goto("/__test__/session-pacing");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pacing-card")).toBeVisible({ timeout: 5000 });

    // Tap the card body (the Pressable with accessibilityRole=button targeting breakdown)
    const cardBody = page.getByRole("button", { name: /Estimated pacing/i });
    await cardBody.tap();

    // Sheet should open with exercise names
    await expect(page.getByText("Cable Row")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Lat Pulldown")).toBeVisible();

    await page.screenshot({
      path: path.join(OUT_DIR, "pacing-breakdown-sheet.png"),
      fullPage: true,
    });
  });
});
