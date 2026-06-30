/**
 * Scenario spec: progress-tab.
 *
 * Regression-guard for the Progress tab (/progress). Navigates to the route,
 * captures top + bottom scroll positions across all four store viewports, and
 * asserts the progress screen's primary container testID is mounted. Includes
 * a hard crash guard: the test FAILS if a `pageerror` fires or a React
 * error-boundary / crash-overlay testID is attached.
 *
 * The store-fold7 (712×853) viewport is the CRITICAL regression surface for
 * this spec — BLD-2074 and BLD-2078 both manifested as a crash overlay on the
 * Progress tab exclusively on the Z Fold6 inner screen (712px wide). That
 * crash was undetected until a store screenshot revealed it.
 *
 * Does NOT require a seeded scenario — the progress screen renders an
 * empty-state when no workout data exists. Skips onboarding via
 * window.__SKIP_ONBOARDING__.
 *
 * Both a "top" and "bottom" scroll-position shot are captured per viewport
 * (mirroring settings.spec.ts BLD-1124 pattern).
 *
 * Three CVD-emulated variants (deuteranopia / protanopia / tritanopia) are
 * also captured for the "bottom" shot via `captureWithCvd`.
 *
 * Structural assertion:
 *   - "progress-screen-container" testID is attached after page load (guards
 *     the primary container introduced in BLD-2357).
 *   - Crash guard: any `pageerror` or `data-testid="react-crash-overlay"`
 *     element causes an immediate test failure.
 *
 * Refs: BLD-2074, BLD-2078, BLD-2357
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "progress-tab";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario progress-tab", () => {
  // BLD-2357 requires the same 4 viewports as settings.spec.ts (BLD-1124 AC1):
  //   mobile        (390×844)  ≈ iPhone 14
  //   mobile-narrow (320×640)  ≈ iPhone SE 3rd gen
  //   store-pixel9  (412×924)  ≈ Pixel 6a
  //   store-fold7   (712×853)  ≈ Z Fold6 inner screen  ← BLD-2074/2078 crash surface
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

  test("captures progress top (tabs + initial segment)", async ({ page }, testInfo) => {
    // Crash guard: any unhandled JS error fails the test immediately.
    // This is the guard BLD-2074/2078 would have tripped had it existed.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress");

    // Wait for the primary container to mount — this also guards empty-state
    // render so we don't capture a blank frame.
    await expect(page.getByTestId("progress-screen-container")).toBeVisible({
      timeout: 20_000,
    });

    // Double rAF to guarantee the compositor has committed a frame.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          void document.documentElement.offsetHeight;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await page.waitForTimeout(300);

    // Crash guard assertion: if any pageerror fired during load, fail now.
    expect(
      pageErrors,
      `pageerror(s) detected on /progress — crash guard tripped (Refs: BLD-2074, BLD-2078):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);

    // Structural assertion: confirm no crash overlay is attached.
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay testID is attached — progress screen crashed (Refs: BLD-2074, BLD-2078)",
    ).not.toBeAttached();

    const viewport = testInfo.project.name;
    const screenshotPath = path.join(
      OUT_DIR,
      `progress-top-${viewport}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(screenshotPath).toBeTruthy();
  });

  test("captures progress bottom (below-fold segment content + CVD variants)", async ({ page }, testInfo) => {
    // Crash guard (same pattern as top test — independent page context).
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress");

    await expect(page.getByTestId("progress-screen-container")).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForTimeout(500);

    // Crash guard assertion before scrolling.
    expect(
      pageErrors,
      `pageerror(s) on /progress before scroll:\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay attached before scroll on progress screen",
    ).not.toBeAttached();

    // Scroll the inner React Native container (not the document).
    // The progress screen uses a ScrollableTabs + segment composition;
    // try the scrollable tabs container first, fall back to the screen root.
    const container = page.getByTestId("progress-screen-container");
    await container.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    // Crash guard: post-scroll — the BLD-2074/2078 crash manifested specifically
    // at this viewport width after the component tree fully rendered.
    expect(
      pageErrors,
      `pageerror(s) on /progress after scroll — crash guard tripped (Refs: BLD-2074, BLD-2078):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay appeared after scroll on progress screen (Refs: BLD-2074, BLD-2078)",
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
        note: "Bottom of progress tab — regression surface for BLD-2074/BLD-2078 wide-viewport crash on store-fold7",
      },
    });
  });

  test("progress-screen-container testID is mounted and no crash overlay (BLD-2357)", async ({ page }) => {
    // Structural IA assertion + crash guard on all allowed viewports.
    // This test is the durable regression-lock: if the progress screen crashes
    // or its root container is removed, this fails immediately.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress");

    // Wait for the progress container to mount.
    await expect(page.getByTestId("progress-screen-container")).toBeVisible({
      timeout: 20_000,
    });

    // Structural assertion: container is attached (not just visible).
    await expect(
      page.getByTestId("progress-screen-container"),
      "progress-screen-container testID must be attached after page load",
    ).toBeAttached({ timeout: 5_000 });

    // Hard crash guard.
    expect(
      pageErrors,
      `pageerror(s) detected on /progress — crash guard tripped (Refs: BLD-2074, BLD-2078):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);

    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay must not be attached on progress screen (Refs: BLD-2074, BLD-2078)",
    ).not.toBeAttached({ timeout: 3_000 });
  });
});
