/**
 * Scenario spec: workout-history.
 *
 * Seeds 5 completed sessions via window.__TEST_SCENARIO__, navigates to
 * /history, and captures a screenshot at the `mobile` Playwright project
 * viewport (v1 is mobile-only per TL#4). Each scenario also captures three
 * CVD-emulated variants (deuteranopia / protanopia / tritanopia) via the
 * helper in `./capture-with-cvd.ts` (BLD-744).
 *
 * Refs: BLD-494, BLD-481, BLD-744
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "workout-history";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario workout-history", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  test("captures populated workout history", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, SCENARIO);

    await page.goto("/history");

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
        label: "workout-history-populated",
        route: "/history",
        viewport,
        viewportSize: page.viewportSize(),
        commitSha: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? null,
        capturedAt: new Date().toISOString(),
      },
    });
  });
});
