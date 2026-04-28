/**
 * Scenario capture helper with CVD (color-vision-deficiency) emulation.
 *
 * Wraps the baseline `page.screenshot()` + meta JSON write pattern shared by
 * the scenario specs (`completed-workout`, `workout-history`, …) and adds
 * three additional captures per screen using Chromium DevTools Protocol's
 * `Emulation.setEmulatedVisionDeficiency`:
 *
 *   - `deuteranopia` — green-cone deficiency (~6% of males)
 *   - `protanopia`   — red-cone deficiency   (~2% of males)
 *   - `tritanopia`   — blue-cone deficiency  (rare, ~0.01%)
 *
 * Output shape under `<OUT_DIR>/`:
 *
 *   <viewport>.png                      ← baseline (unchanged from prior behaviour)
 *   <viewport>-deuteranopia.png         ← CVD-emulated capture
 *   <viewport>-protanopia.png
 *   <viewport>-tritanopia.png
 *   <viewport>.json                     ← meta, with `emulatedDeficiencies` array
 *
 * Why a single CDP session loop:
 *   - Same browser context / same page → no re-navigation, no re-seed.
 *   - Three extra `page.screenshot()` calls add ~1–2s per scenario, well
 *     under the 25-min `timeout-minutes` workflow budget (BLD-744).
 *   - CDP `setEmulatedVisionDeficiency` is a pure rendering filter applied
 *     by the compositor — it does not affect DOM, layout, or test fixtures.
 *
 * Refs: BLD-744 (this helper), BLD-732 (PR #410 — by-construction CVD safety
 * that motivated automating the CI gate), Chromium DevTools Protocol docs:
 * https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setEmulatedVisionDeficiency
 */
import type { Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Modes captured per scenario, in deterministic order. Acceptance criteria
 * (BLD-744) require exactly these three; `achromatopsia`, `blurredVision`,
 * and `reducedContrast` are intentionally omitted from the v1 gate.
 */
export const CVD_MODES = ["deuteranopia", "protanopia", "tritanopia"] as const;
export type CvdMode = (typeof CVD_MODES)[number];

/** Meta block written next to the PNGs. Extra fields are passed through. */
export type ScenarioMeta = Record<string, unknown> & {
  scenario: string;
  viewport: string;
};

export type CaptureWithCvdOptions = {
  /** Playwright page already navigated and gated on data-test-ready. */
  page: Page;
  /** Absolute path to the per-scenario output directory; will be `mkdir -p`'d. */
  outDir: string;
  /** Logical viewport label, e.g. `"mobile"`. Used as the filename stem. */
  viewport: string;
  /** Meta JSON contents (will be augmented with `emulatedDeficiencies`). */
  meta: ScenarioMeta;
};

/**
 * Capture baseline + 3 CVD-emulated screenshots for a single scenario page.
 *
 * Caller is responsible for navigation, seeding, and waiting for the page
 * to be ready (typically `await expect(body[data-test-ready='true']).toBeVisible()`).
 *
 * The CDP session is closed and emulation is reset to `none` before this
 * function returns, so any subsequent assertions or teardown see a normal
 * rendering path.
 */
export async function captureWithCvd(
  options: CaptureWithCvdOptions,
): Promise<void> {
  const { page, outDir, viewport, meta } = options;

  fs.mkdirSync(outDir, { recursive: true });

  // 1. Baseline (no emulation). Preserve historical filename `<viewport>.png`
  //    so the ux-designer agent and any pinned references keep working.
  const baselinePath = path.join(outDir, `${viewport}.png`);
  await page.screenshot({ path: baselinePath, fullPage: true });

  // 2. CVD captures via a single CDP session. We bind the session to the
  //    main page; the emulation applies to the entire frame tree.
  const cdp = await page.context().newCDPSession(page);
  try {
    for (const mode of CVD_MODES) {
      await cdp.send("Emulation.setEmulatedVisionDeficiency", { type: mode });
      const cvdPath = path.join(outDir, `${viewport}-${mode}.png`);
      await page.screenshot({ path: cvdPath, fullPage: true });
    }
  } finally {
    // Always reset emulation, even on error, so the page state is clean
    // for any later assertions in the same test.
    try {
      await cdp.send("Emulation.setEmulatedVisionDeficiency", { type: "none" });
    } catch {
      // CDP may already be torn down on hard failure paths; ignore.
    }
    await cdp.detach().catch(() => {
      // Detach failures are non-fatal — the page context teardown will
      // close the session anyway.
    });
  }

  // 3. Meta JSON — written once at the end with the full mode list so
  //    consumers (ux-designer agent) can deterministically iterate.
  const metaPath = path.join(outDir, `${viewport}.json`);
  const enrichedMeta = {
    ...meta,
    emulatedDeficiencies: ["baseline", ...CVD_MODES],
  };
  fs.writeFileSync(metaPath, JSON.stringify(enrichedMeta, null, 2));
}
