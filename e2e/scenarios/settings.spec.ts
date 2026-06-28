/**
 * Scenario spec: settings.
 *
 * Navigates to /settings and captures the full screen including the bottom
 * portion (BMC / thanks.dev badge, About card) with the floating tab bar in
 * frame, so the daily UX audit can detect any future regression where bottom
 * content is clipped by the floating tab bar.
 *
 * Does NOT require a seeded scenario — the settings screen is self-contained.
 * Skips onboarding via window.__SKIP_ONBOARDING__.
 *
 * Both a "top" and "bottom" scroll-position shot are captured:
 *   - "top"  : fresh page load, showing the upper settings cards
 *   - "bottom": scrolled to the end, showing BMC/thanks.dev/About cards above
 *               the floating tab bar (the regression surface from BLD-1106 /
 *               BLD-1124)
 *
 * Three CVD-emulated variants (deuteranopia / protanopia / tritanopia) are
 * also captured for the "bottom" shot via `captureWithCvd`.
 *
 * Structural IA assertions (BLD-2091):
 *   - "settings-masonry container and all 7 settings-tile-* IDs are mounted"
 *     asserts the masonry container and all 7 tile testIDs from PR #655 are
 *     attached to the DOM. Uses toBeAttached() (not toBeVisible()) because tiles
 *     lower in the scroll list may be off-screen on short viewports.
 *
 * Refs: BLD-1106, BLD-1124, BLD-2031, BLD-2091
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "settings";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario settings", () => {
  // BLD-1124 AC1 requires Z Fold6, Pixel 6a, iPhone 14, iPhone SE 3rd gen.
  // mobile        (390×844)  ≈ iPhone 14
  // mobile-narrow (320×640)  ≈ iPhone SE 3rd gen
  // store-pixel9  (412×924)  ≈ Pixel 6a
  // store-fold7   (712×853)  ≈ Z Fold6 inner screen
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
      "BLD-1124 AC1: only run on SE3 / iPhone 14 / Pixel 6a / Fold6 viewports",
    );
  });

  test("captures settings top (title + first cards)", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/settings");
    // Container mounted + first-card content painted (prevents blank captures, BLD-1249).
    // ScrollView host visibility alone is insufficient: the RN tree can mount
    // before its children paint, and Playwright's `toBeVisible` only checks
    // DOM/bbox — not compositor paint commit. Anchor on the UnitsCard "Units"
    // heading (components/settings/UnitsCard.tsx) being in the viewport, then
    // force a layout flush + double rAF to guarantee the compositor has
    // committed a frame before screenshot.
    await expect(page.getByTestId("settings-scroll-view")).toBeVisible({
      timeout: 20_000,
    });
    const unitsHeading = page.getByText("Units", { exact: true });
    await unitsHeading.scrollIntoViewIfNeeded({ timeout: 5_000 });
    await expect(unitsHeading).toBeInViewport({ timeout: 5_000 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          // Force synchronous layout, then wait for two animation frames so the
          // compositor commits before the screenshot fires.
          void document.documentElement.offsetHeight;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await page.waitForTimeout(300);

    const viewport = testInfo.project.name;
    const screenshotPath = path.join(OUT_DIR, `settings-top-${viewport}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(screenshotPath).toBeTruthy();
  });

  test("captures settings bottom — BMC/About cards above floating tab bar", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/settings");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    // Scroll the inner React Native ScrollView (not the document) to the bottom
    // so the About / BMC badges are in frame. window.scrollTo() does not move
    // RN's own scroll container — scroll the testID element directly.
    const scrollEl = page.getByTestId("settings-scroll-view");
    await scrollEl.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    // scrollHeight may be stale if new settings rows were added (BLD-1126/1110/etc.).
    // Use scrollIntoViewIfNeeded() as a surgical follow-up to guarantee the target
    // is actually visible regardless of content height changes.
    const aboutLocator = page.getByText(/about|buy me a coffee|thanks\.dev/i).first();
    await aboutLocator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Assert a known bottom-of-settings element is visible before capturing,
    // so the spec detects the exact cutoff regression this ticket was filed for.
    await expect(aboutLocator).toBeInViewport({ timeout: 5_000 });

    const viewport = testInfo.project.name;
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        viewport,
        capturedAt: new Date().toISOString(),
        note: "Bottom of settings — BMC/About section above floating tab bar (BLD-1124 regression surface)",
      },
    });
  });

  test("settings-masonry container and all 7 settings-tile-* IDs are mounted (BLD-2091)", async ({ page }) => {
    // BLD-2091: regression-lock the Settings IA structure introduced in PR #655.
    // Assert that the masonry container and every named tile testID are attached
    // to the DOM after page load. We use toBeAttached() rather than toBeVisible()
    // because tiles toward the bottom of the scroll list may be off-screen on
    // short-viewport devices (iPhone SE 3rd gen, etc.) and would fail a
    // toBeVisible() check without scrolling — but structural presence is the
    // invariant we want to protect, not viewport position.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/settings");

    // Wait for the scroll view to mount — indicates the settings tree is rendered.
    await expect(page.getByTestId("settings-scroll-view")).toBeVisible({
      timeout: 20_000,
    });

    // Assert the masonry container is attached.
    await expect(page.getByTestId("settings-masonry")).toBeAttached({
      timeout: 5_000,
    });

    // Assert all 7 settings-tile-* IDs introduced in PR #655 are attached.
    // If a tile is removed or its testID is renamed, this test will catch it.
    const expectedTileIds = [
      "settings-tile-profile",
      "settings-tile-units-appearance",
      "settings-tile-training",
      "settings-tile-notifications",
      "settings-tile-coaching",
      "settings-tile-data-backup",
      "settings-tile-about",
    ] as const;

    for (const tileId of expectedTileIds) {
      await expect(
        page.getByTestId(tileId),
        `Expected tile "${tileId}" to be attached to the DOM`,
      ).toBeAttached({ timeout: 5_000 });
    }
  });
});
