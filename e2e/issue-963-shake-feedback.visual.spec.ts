import { expect, test } from "@playwright/test";
import { skipOnboarding, suppressUpdatePrompt } from "./helpers";

const cases = [360, 768, 1280].flatMap((width) =>
  (["light", "dark"] as const).flatMap((theme) =>
    (["ready", "failed"] as const).map((state) => ({ width, theme, state })),
  ),
);

test.describe("GH-963 shake feedback visual evidence", () => {
  for (const item of cases) {
    test(`${item.state}-${item.width}-${item.theme}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "One project renders the explicit viewport matrix");
      await page.setViewportSize({ width: item.width, height: item.width === 360 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: item.theme, reducedMotion: "reduce" });
      await suppressUpdatePrompt(page);
      await skipOnboarding(page);
      await page.goto(`/feedback?source=shake&type=bug&screenshotAudit=${item.state}`);

      await expect(page.getByTestId("update-available-dialog")).toHaveCount(0);
      await expect(page.getByTestId("feedback-form")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Report what you saw" })).toHaveCount(1);
      const section = page.getByTestId("feedback-screenshot-section");
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();

      if (item.state === "ready") {
        const preview = page.getByTestId("feedback-screenshot-preview");
        const retake = page.getByTestId("feedback-retake-screenshot");
        const share = page.getByTestId("feedback-share-screenshot");
        await expect(preview).toHaveAttribute("aria-label", "Screenshot preview");
        await expect(page.getByText("Review the screenshot for sensitive information before sharing.")).toBeVisible();
        await expect(page.getByTestId("feedback-include-screenshot").locator('input[type="checkbox"]')).toBeChecked();
        const previewBox = await preview.boundingBox();
        const retakeBox = await retake.boundingBox();
        const shareBox = await share.boundingBox();
        expect(previewBox).not.toBeNull();
        expect(retakeBox).not.toBeNull();
        expect(shareBox).not.toBeNull();
        if (item.width < 600) {
          expect((retakeBox?.y ?? 0)).toBeGreaterThan((previewBox?.y ?? 0) + (previewBox?.height ?? 0) - 2);
          expect((shareBox?.y ?? 0)).toBeGreaterThan((retakeBox?.y ?? 0));
        } else {
          expect((retakeBox?.x ?? 0)).toBeGreaterThan((previewBox?.x ?? 0) + (previewBox?.width ?? 0) - 2);
        }
      } else {
        await expect(page.getByText("Screenshot unavailable", { exact: true })).toBeVisible();
        await expect(page.getByTestId("feedback-screenshot-try-again")).toBeVisible();
        await expect(page.getByText("Review the screenshot for sensitive information before sharing.")).toHaveCount(0);
      }

      await page.screenshot({ path: testInfo.outputPath(`feedback-${item.state}-${item.width}-${item.theme}.png`), fullPage: true });
    });
  }

  test("settings row at 360", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "One project renders the explicit viewport");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await suppressUpdatePrompt(page);
    await skipOnboarding(page);
    await page.goto("/settings");
    const row = page.getByTestId("shake-to-report-row");
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    await expect(page.getByTestId("shake-to-report-switch").locator('input[type="checkbox"]')).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath("settings-shake-to-report-360-light.png"), fullPage: false });
  });
});
