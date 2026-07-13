/**
 * Scenario spec: pinned-note-persist.
 *
 * Verifies that a per-exercise pinned note (BLD-1028) autosaves via the
 * 600ms debounce and survives a full page reload. The seed does NOT clear
 * the `exercises` table, so the updated `notes` column persists across the
 * reload boundary.
 *
 * Refs: issue #1
 */
import { test, expect } from "@playwright/test";
import { enablePerWorkerDb } from "../helpers";

const SCENARIO = "pinned-note";
const EXERCISE_ID = "scenario-pinned-ex-1";

test.describe("@scenario pinned-note-persist", () => {
  // v1 mobile only.
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "v1: mobile viewport only (TL#4)",
    );
  });

  // BLD-1791: per-worker DB isolation.
  test.beforeEach(async ({ page }, testInfo) => {
    await enablePerWorkerDb(page, testInfo.parallelIndex);
  });

  test("pinned note autosaves and survives reload", async ({ page }) => {
    const NOTE_TEXT = "Cable length 4 for this machine";

    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, SCENARIO);

    await page.goto(`/exercise/${EXERCISE_ID}`);

    // The seedScenario sets body[data-test-ready='true'] after clearing +
    // re-seeding (exercises table is NOT cleared).
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // The exercise has empty notes, so the "+ Add pinned note" button is shown.
    const addBtn = page.getByLabel(`Add pinned note for Triceps Push-down`);
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // The editor Input (type=textarea) is now visible.
    const editorInput = page.getByLabel(`Edit pinned note for Triceps Push-down`);
    await expect(editorInput).toBeVisible({ timeout: 5_000 });
    await editorInput.fill(NOTE_TEXT);

    // Wait for the 600ms debounce to fire and persist the note.
    await page.waitForTimeout(900);

    // Reload — the exercises table is NOT touched by the seed clear, so the
    // note column value survives the re-seed (INSERT OR IGNORE skips existing).
    await page.reload();
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // The persisted note text should be visible on the page.
    await expect(
      page.getByText(NOTE_TEXT, { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
