/**
 * Scenario spec: completed-workout-prefix (BLD-480 regression-catcher).
 *
 * Renders the post-workout summary's `MusclesWorkedCard` wrapped in the
 * regressed `maxHeight: 200` clamp via the dev-only fixture route at
 * `/__fixtures__/bld-480-prefix`. This is the modern replacement for the
 * old `daily-audit.sh` flow that did `git checkout cce2ac1f...` against a
 * pre-fix commit — that approach broke under Node 22 / old Expo SDK
 * (BLD-924, BLD-941, BLD-943) and is now retired.
 *
 * Output goes into the `bld-480-prefix` directory under
 * `.pixelslop/screenshots/scenarios/`. `scripts/daily-audit.sh` then copies
 * the result into the date-stamped `BLD_480_PRE_FIX/` audit-bundle subdir
 * so the ux-designer agent's intake (and any other downstream consumer)
 * sees the historically-stable bundle path.
 *
 * Acceptance gate (QD#2): the rendered PNG must reproduce the visual crop
 * unambiguously enough that the ux-designer vision pipeline emits at least
 * one finding whose description matches (case-insensitive):
 *   crop | truncat | clip | maxHeight | cut off | MusclesWorkedCard | body-figure
 *
 * Refs: BLD-480, BLD-494, BLD-744, BLD-924, BLD-941, BLD-943, BLD-951.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "bld-480-prefix";
// Reuse the existing `completed-workout` seed so the fixture route
// has the same MuscleMap data the real summary screen has. This keeps the
// reproducer faithful to the original BLD-480 visual context.
const SEED_SCENARIO = "completed-workout";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario bld-480-prefix", () => {
  // v1 mobile only — match completed-workout.spec.ts (TL#4).
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  test("captures BLD-480 pre-fix MusclesWorkedCard reproducer", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      // Seeding still uses the production `completed-workout` scenario so
      // the in-memory DB has a `scenario-session-1` row with the same
      // primary/secondary muscle aggregation the real summary screen uses.
      // The fixture route then reads that row via `useSummaryData`.
      w.__TEST_SCENARIO__ = scenario;
    }, SEED_SCENARIO);

    await page.goto("/__fixtures__/bld-480-prefix");

    // Same readiness gate as the real summary scenario: `lib/db/test-seed.ts`
    // flips `body[data-test-ready='true']` after seeding completes; the
    // fixture route additionally re-flips it once `useSummaryData` has the
    // session loaded.
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });
    // Wait for the fixture's render-complete marker so we screenshot the
    // populated card, not the seeding-skeleton state.
    await expect(page.locator("[data-testid='bld-480-prefix-fixture']")).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(500);

    const viewport = "mobile";
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        label: "bld-480-prefix-musclesworkedcard-crop",
        route: "/__fixtures__/bld-480-prefix",
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
        // Embed the fixture origin in the meta so the ux-designer intake
        // can correlate findings with this issue if/when it ever flags an
        // unexpected absence of crop findings.
        fixture: {
          origin: "BLD-951",
          reproduces: "BLD-480",
          mechanism: "maxHeight:200 clamp re-imposed via wrapper",
        },
      },
    });
  });
});
