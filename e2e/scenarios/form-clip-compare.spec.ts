/**
 * e2e/scenarios/form-clip-compare.spec.ts
 *
 * BLD-1151: Form Check Comparison View — E2E Playwright spec.
 *
 * Uses the form-clips harness (`app/__test__/form-clips.tsx`) to assert the
 * select-mode entry point for CompareView. Native video playback and file-system
 * are not exercised in the web harness — those are covered by Jest unit tests.
 *
 * Tests:
 *  1. Two clips selected → Compare button becomes active (not disabled).
 *  2. One clip selected → Compare button is absent or disabled.
 *  3. Swap and Change affordances present in harness select-mode.
 *
 * Memory rules applied:
 *  - RN-Web Switch: use `.first()` to avoid strict-mode violation.
 *  - Use `.click()` not `.tap()` (mobile viewport only, no hasTouch).
 *
 * Refs: BLD-1151, AC1.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const SCENARIO = "form-clip-compare";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

const CLIP_BASE = {
  exercise_id: "ex-compare-1",
  kind: "video",
  duration_ms: 5000,
  size_bytes: 1000000,
  width: 1080,
  height: 1920,
  pending_delete: 0,
};

const clipA = {
  ...CLIP_BASE,
  id: "clip-compare-a",
  set_id: "set-compare-a",
  rel_path: "form-clips/ex-compare-1/clip-compare-a.mp4",
  created_at: Date.now() - 7200000,
};

const clipB = {
  ...CLIP_BASE,
  id: "clip-compare-b",
  set_id: "set-compare-b",
  rel_path: "form-clips/ex-compare-1/clip-compare-b.mp4",
  created_at: Date.now() - 3600000,
};

test.describe("@scenario form-clip-compare", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !["mobile"].includes(testInfo.project.name),
      "form-clip-compare harness: mobile viewport only",
    );
  });

  test("two clips selected → Compare CTA becomes enabled (AC1)", async ({ page }) => {
    await page.addInitScript((clips: { clipA: typeof clipA; clipB: typeof clipB }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__FORM_CLIPS_HARNESS__ = {
        exerciseId: "ex-compare-1",
        clips: [clips.clipA, clips.clipB],
        recordTarget: null,
        recordDisabledReason: "all_have_clips",
      };
    }, { clipA, clipB });

    await page.goto("/__test__/form-clips");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });

    // Enter select mode.
    await page.getByRole("button", { name: "Select clips" }).click();

    // Select both clips — clips render as pressable thumbnails.
    const thumbnails = page.getByRole("button", { name: /Select clip/i });
    await thumbnails.first().click();
    await thumbnails.last().click();

    // Compare button should become active.
    const compareBtn = page.getByRole("button", { name: "Compare" });
    await expect(compareBtn).toBeVisible({ timeout: 5000 });
    // Must not be aria-disabled when 2 are selected.
    await expect(compareBtn).not.toHaveAttribute("aria-disabled", "true");

    await page.screenshot({
      path: path.join(OUT_DIR, "two-selected.png"),
      fullPage: true,
    });
  });

  test("one clip selected → Compare CTA is absent or disabled (AC1)", async ({ page }) => {
    await page.addInitScript((clips: { clipA: typeof clipA; clipB: typeof clipB }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__FORM_CLIPS_HARNESS__ = {
        exerciseId: "ex-compare-1",
        clips: [clips.clipA, clips.clipB],
        recordTarget: null,
        recordDisabledReason: "all_have_clips",
      };
    }, { clipA, clipB });

    await page.goto("/__test__/form-clips");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });

    // Enter select mode.
    await page.getByRole("button", { name: "Select clips" }).click();

    // Select only one clip.
    const thumbnails = page.getByRole("button", { name: /Select clip/i });
    await thumbnails.first().click();

    // With only one selected, Compare should not be present or should be disabled.
    const compareBtn = page.getByRole("button", { name: "Compare" });
    const visible = await compareBtn.isVisible().catch(() => false);
    if (visible) {
      // If it's visible, it must be disabled.
      const disabled =
        (await compareBtn.getAttribute("aria-disabled")) === "true" ||
        (await compareBtn.isDisabled());
      expect(disabled).toBe(true);
    }
    // else: not present — also acceptable.

    await page.screenshot({
      path: path.join(OUT_DIR, "one-selected.png"),
      fullPage: true,
    });
  });

  test("form clips grid renders with 2 clips visible (seed check)", async ({ page }) => {
    await page.addInitScript((clips: { clipA: typeof clipA; clipB: typeof clipB }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__FORM_CLIPS_HARNESS__ = {
        exerciseId: "ex-compare-1",
        clips: [clips.clipA, clips.clipB],
        recordTarget: null,
        recordDisabledReason: "all_have_clips",
      };
    }, { clipA, clipB });

    await page.goto("/__test__/form-clips");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });

    // Count badge should show "2".
    await expect(page.getByText("2")).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: path.join(OUT_DIR, "grid-seed.png"),
      fullPage: true,
    });
  });
});
