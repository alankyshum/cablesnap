/**
 * Visual regression for SessionHeaderToolbar's adaptive rest chip (BLD-534).
 *
 * Covers the `truncateChipLabel` path introduced in BLD-531 / PR #322:
 *   - 320dp viewport → chip truncated to 2 tokens
 *   - 375dp viewport → chip truncated to 2 tokens (<360dp cutoff just missed? see below)
 *   - 430dp viewport → chip renders full 3-token label
 *
 * Note: `truncateChipLabel` triggers when `viewportWidth < 360`. 375 is above
 * the cutoff, so at 375dp the chip already shows the full label. The spec
 * still captures 375 because it's the iPhone-X-class baseline width and we
 * want a baseline that protects against regressions around the 360dp boundary.
 *
 * For each width we also capture the `mode=default` (breakdown.isDefault =
 * true) state, which suppresses the chip entirely. 3 widths × 2 states = 6
 * snapshots.
 *
 * Harness: `app/e2e-rest-chip.tsx`, guarded by __DEV__ + Platform.OS === web
 * + navigator.webdriver === true (production users see a blank page).
 *
 * Baselines live under e2e/__screenshots__/mobile/ to match the
 * `snapshotPathTemplate` in playwright.config.ts. The suite is pinned to the
 * `mobile` project so we don't duplicate the same 6 snapshots across every
 * project viewport (we override `page.setViewportSize()` per test anyway).
 *
 * Regenerate baselines via the `E2E Update Snapshots` workflow:
 *   gh workflow run e2e-update-snapshots.yml \
 *     -f spec=e2e/rest-chip-visual.spec.ts -f projects=mobile
 */
import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./helpers";

const WIDTHS = [320, 375, 430] as const;
const MODES = ["adaptive", "default"] as const;

test.describe("SessionHeaderToolbar adaptive rest chip — visual", () => {
  test.beforeAll((_args, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "rest-chip-visual only runs on the `mobile` project; viewport is overridden per test.",
    );
  });

  for (const width of WIDTHS) {
    for (const mode of MODES) {
      test(`${mode} breakdown @ ${width}dp`, async ({ page }) => {
        await page.setViewportSize({ width, height: 640 });
        await skipOnboarding(page);

        await page.goto(`/e2e-rest-chip?mode=${mode}`);

        // Harness renders the toolbar synchronously after mount. Wait for the
        // harness container (confirms __DEV__ + webdriver guards passed) and
        // then settle one animation frame so theme fonts/colors are applied.
        await page.waitForSelector('[data-testid="e2e-rest-chip-harness"]', {
          timeout: 15_000,
        });
        await page.waitForTimeout(250);

        const toolbar = page.locator(
          '[data-testid="e2e-rest-chip-toolbar"]',
        );
        await expect(toolbar).toBeVisible();

        await expect(toolbar).toHaveScreenshot(
          `rest-chip-${mode}-${width}dp.png`,
          {
            maxDiffPixelRatio: 0.01,
            animations: "disabled",
          },
        );
      });
    }
  }
});
