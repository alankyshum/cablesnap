/**
 * Scenario spec: nutrition-tab.
 *
 * Regression-guard for the Nutrition tab (/nutrition). Navigates to the route,
 * captures top + bottom scroll positions across all four store viewports, and
 * asserts the nutrition screen's primary container testID and scroll-view are
 * mounted. Includes a hard crash guard: the test FAILS if a `pageerror` fires
 * or a React error-boundary / crash-overlay testID is attached.
 *
 * Does NOT require a seeded scenario — the nutrition screen renders a
 * self-contained default state (empty food log for today) when no data exists,
 * exactly like settings.spec.ts which needs no seed. If a test-seed hook for
 * nutrition exists in the future, it can be added here; for now, the empty
 * state is the authoritative capture.
 *
 * NOTE: The nutrition screen renders "No food logged yet." when empty.
 * The spec asserts the SectionList container is mounted (not the items),
 * so the empty-state is a valid structural baseline.
 *
 * Both a "top" and "bottom" scroll-position shot are captured per viewport
 * (mirroring settings.spec.ts BLD-1124 pattern).
 *
 * Three CVD-emulated variants (deuteranopia / protanopia / tritanopia) are
 * also captured for the "bottom" shot via `captureWithCvd`.
 *
 * Structural assertions:
 *   - "nutrition-screen-container" testID is attached after page load.
 *   - "nutrition-scroll-view" (SectionList) testID is attached.
 *   - Crash guard: any `pageerror` or `data-testid="react-crash-overlay"`
 *     element causes an immediate test failure.
 *
 * Refs: BLD-1819, BLD-2357
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "nutrition-tab";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario nutrition-tab", () => {
  // Same 4 viewports as settings.spec.ts (BLD-1124 AC1):
  //   mobile        (390×844)  ≈ iPhone 14
  //   mobile-narrow (320×640)  ≈ iPhone SE 3rd gen
  //   store-pixel9  (412×924)  ≈ Pixel 6a
  //   store-fold7   (712×853)  ≈ Z Fold6 inner screen
  const ALLOWED_PROJECTS = new Set([
    "mobile",
    "mobile-narrow",
    "store-pixel9",
    "store-fold7",
  ]);
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !ALLOWED_PROJECTS.has(testInfo.project.name),
      "BLD-2357: only run on SE3 / iPhone 14 / Pixel 6a / Fold6 viewports",
    );
  });

  test("captures nutrition top (header + macro ring)", async ({ page }, testInfo) => {
    // Crash guard: any unhandled JS error fails the test immediately.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/nutrition");

    // Wait for the primary container to mount.
    await expect(page.getByTestId("nutrition-screen-container")).toBeVisible({
      timeout: 20_000,
    });

    // Double rAF to guarantee compositor commit before screenshot.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          void document.documentElement.offsetHeight;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await page.waitForTimeout(300);

    // Crash guard assertion.
    expect(
      pageErrors,
      `pageerror(s) detected on /nutrition — crash guard tripped (Refs: BLD-1819):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);

    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay testID is attached — nutrition screen crashed (Refs: BLD-1819)",
    ).not.toBeAttached();

    const viewport = testInfo.project.name;
    const screenshotPath = path.join(
      OUT_DIR,
      `nutrition-top-${viewport}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(screenshotPath).toBeTruthy();
  });

  test("captures nutrition bottom (empty-state / food log list + CVD variants)", async ({ page }, testInfo) => {
    // Capture the empty default state at the bottom of the SectionList.
    // No seed needed: nutrition renders a self-contained default state.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/nutrition");

    await expect(page.getByTestId("nutrition-screen-container")).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForTimeout(500);

    // Pre-scroll crash guard.
    expect(
      pageErrors,
      `pageerror(s) on /nutrition before scroll:\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay attached before scroll on nutrition screen",
    ).not.toBeAttached();

    // Scroll the SectionList container (not the document).
    const scrollEl = page.getByTestId("nutrition-scroll-view");
    await expect(scrollEl).toBeVisible({ timeout: 10_000 });
    await scrollEl.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    // Post-scroll crash guard.
    expect(
      pageErrors,
      `pageerror(s) on /nutrition after scroll:\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay appeared after scroll on nutrition screen (Refs: BLD-1819)",
    ).not.toBeAttached();

    const viewport = testInfo.project.name;
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        viewport,
        capturedAt: new Date().toISOString(),
        note: "Bottom of nutrition tab — default empty state capture; no seed required (mirrors settings.spec.ts). Refs: BLD-1819",
      },
    });
  });

  test("nutrition-screen-container and nutrition-scroll-view testIDs are mounted (BLD-2357)", async ({ page }) => {
    // Structural IA assertion + crash guard on all allowed viewports.
    // Fails if the nutrition screen crashes or its root containers are removed.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/nutrition");

    // Wait for the primary container.
    await expect(page.getByTestId("nutrition-screen-container")).toBeVisible({
      timeout: 20_000,
    });

    // Structural assertions: both containers attached.
    await expect(
      page.getByTestId("nutrition-screen-container"),
      "nutrition-screen-container testID must be attached after page load",
    ).toBeAttached({ timeout: 5_000 });

    await expect(
      page.getByTestId("nutrition-scroll-view"),
      "nutrition-scroll-view (SectionList) testID must be attached after page load",
    ).toBeAttached({ timeout: 5_000 });

    // Hard crash guard.
    expect(
      pageErrors,
      `pageerror(s) detected on /nutrition — crash guard tripped (Refs: BLD-1819):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);

    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay must not be attached on nutrition screen (Refs: BLD-1819)",
    ).not.toBeAttached({ timeout: 3_000 });
  });
});
