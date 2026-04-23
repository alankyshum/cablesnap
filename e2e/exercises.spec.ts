import { test, expect } from "@playwright/test";
import { skipOnboarding, assertAccessible } from "./helpers";

// CI first-paint on the static export can be slow (wa-sqlite WASM + icon
// font initialization happens before React mounts). Use generous timeouts.
test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test.describe("Exercises tab", () => {
  test("visual snapshot of exercise list with filter chips", async ({ page }) => {
    await page.goto("/exercises");
    await page.waitForSelector('[role="button"]', { timeout: 60_000 });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("exercises-list.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("passes accessibility audit", async ({ page }, testInfo) => {
    await page.goto("/exercises");
    await page.waitForSelector('[role="button"]', { timeout: 60_000 });
    await page.waitForTimeout(500);

    await assertAccessible(page, testInfo);
  });
});
