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

  // BLD-1994 regression guard: fail if any React DOM prop warning fires on this screen.
  // "React does not recognize the `importantForAccessibility` prop" (and similar RN-only
  // a11y prop leaks) previously produced a persistent red error toast visible on this screen.
  test("no React DOM prop warnings on session-pacing screen (BLD-1994)", async ({ page }) => {
    const domPropErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          text.includes("does not recognize") ||
          text.includes("non-boolean attribute") ||
          text.includes("Invalid prop")
        ) {
          domPropErrors.push(text);
        }
      }
    });

    page.on("pageerror", (err) => {
      if (
        err.message.includes("does not recognize") ||
        err.message.includes("non-boolean attribute")
      ) {
        domPropErrors.push(err.message);
      }
    });

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

    // Allow any deferred renders to fire
    await page.waitForTimeout(500);

    expect(
      domPropErrors,
      "React DOM prop warnings found on session-pacing screen — RN-only a11y props may be leaking to SVG DOM elements",
    ).toHaveLength(0);
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

    // Click the card body (the Pressable with accessibilityRole=button targeting breakdown).
    // Use click() — the mobile Playwright project sets only viewport, not hasTouch,
    // so tap() is not supported. click() triggers the onPress handler identically.
    const cardBody = page.getByRole("button", { name: /Estimated pacing/i });
    await cardBody.click();

    // Sheet should open — wait for the title to confirm the BottomSheet is mounted.
    await expect(page.getByText("Pacing by exercise")).toBeVisible({ timeout: 5000 });

    // The BottomSheet opens at snap-point 0 (50% height). Tap the drag handle
    // once to advance to snap-point 1 (90% height) so the per-exercise rows
    // are in the viewport (BLD-1767 root cause: only header/columns visible at 50%).
    const handle = page.getByTestId("bottom-sheet-handle");
    await handle.click();
    // Allow the spring animation (damping=50, stiffness=400) to settle.
    await page.waitForTimeout(400);

    // Scroll the inner exercise-row ScrollView so the last seeded exercise
    // is in frame, mirroring the settings.spec.ts:112 pattern.
    const lastExercise = page.getByText("Bodyweight Dips");
    await lastExercise.scrollIntoViewIfNeeded({ timeout: 5000 });

    // Assert a known per-exercise row is in the viewport BEFORE capturing,
    // so a genuine future cutoff regression still fails the test.
    await expect(lastExercise).toBeInViewport({ timeout: 5000 });
    await expect(page.getByText("Cable Row")).toBeVisible();

    // Let the BottomSheet open animation settle (withSpring translateY + withTiming
    // opacity, ~300ms) before capturing — otherwise the sheet is screenshotted
    // mid-travel and appears as a thin sliver peeking from the bottom (BLD-1767).
    // Consistent with the 500ms pattern in completed-workout.spec.ts:52,
    // with extra headroom for the spring settling time.
    await page.waitForTimeout(600);

    await page.screenshot({
      path: path.join(OUT_DIR, "pacing-breakdown-sheet.png"),
      fullPage: true,
    });
  });
});
