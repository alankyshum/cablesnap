import { expect, test } from "@playwright/test";
import { skipOnboarding, suppressUpdatePrompt } from "./helpers";

const cases = [
  { name: "narrow-light-ready", width: 320, height: 720, theme: "light" as const, state: "ready" },
  { name: "narrow-dark-failed", width: 320, height: 720, theme: "dark" as const, state: "failed" },
  { name: "compact-360-light-ready", width: 360, height: 800, theme: "light" as const, state: "ready" },
  { name: "wide-light-failed", width: 768, height: 900, theme: "light" as const, state: "failed" },
  { name: "wide-dark-ready", width: 768, height: 900, theme: "dark" as const, state: "ready" },
  { name: "landscape-dark-ready", width: 844, height: 390, theme: "dark" as const, state: "ready" },
  { name: "foldable-light-ready", width: 712, height: 853, theme: "light" as const, state: "ready" },
];

test.describe("GH-963 shake feedback visual evidence", () => {
  for (const item of cases) {
    test(item.name, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "One project renders the explicit viewport matrix");
      await page.setViewportSize({ width: item.width, height: item.height });
      await page.emulateMedia({ colorScheme: item.theme });
      await suppressUpdatePrompt(page);
      await skipOnboarding(page);
      await page.goto(`/feedback?source=shake&type=bug&screenshotAudit=${item.state}`);

      const assertNoUpdateDialog = async () => {
        await expect(page.getByTestId("update-available-dialog")).toHaveCount(0);
      };
      const capture = async (section: string) => {
        await assertNoUpdateDialog();
        await page.screenshot({ path: testInfo.outputPath(`${item.name}-${section}.png`), fullPage: false });
      };

      await expect(page.getByRole("heading", { name: "Report what you saw" })).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "Feedback & Reports" })).toHaveCount(0);
      await expect(page.getByTestId("feedback-close")).toBeVisible();
      await expect(page.getByText("Bug Report", { exact: true })).toBeVisible();
      const form = page.getByTestId("feedback-form");
      await expect(form).toBeVisible();
      expect((await form.boundingBox())?.width).toBeLessThanOrEqual(600);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await capture("top");

      if (item.state === "ready") {
        const screenshotSection = page.getByTestId("feedback-screenshot-section");
        await screenshotSection.scrollIntoViewIfNeeded();
        await expect(screenshotSection).toBeVisible();
        await expect(page.getByText("Screenshot captured. Review it before sharing.")).toBeVisible();
        const consent = page.getByTestId("feedback-screenshot-consent").locator('input[type="checkbox"]');
        const shareScreenshot = page.getByTestId("feedback-share-screenshot");
        const removeScreenshot = page.getByTestId("feedback-remove-screenshot");
        await expect(consent).not.toBeChecked();
        await expect(shareScreenshot).toHaveAttribute("aria-disabled", "true");
        await expect(removeScreenshot).toBeVisible();

        const shareBox = await shareScreenshot.boundingBox();
        const removeBox = await removeScreenshot.boundingBox();
        expect(shareBox).not.toBeNull();
        expect(removeBox).not.toBeNull();
        if (item.width < 600) {
          expect(Math.abs((shareBox?.y ?? 0) - (removeBox?.y ?? 0))).toBeGreaterThan(20);
        } else {
          expect(Math.abs((shareBox?.y ?? 0) - (removeBox?.y ?? 0))).toBeLessThan(4);
        }

        await capture("screenshot");
        await consent.click();
        await expect(consent).toBeChecked();
        await expect(shareScreenshot).not.toHaveAttribute("aria-disabled", "true");
      } else {
        const failure = page.getByText("Screenshot unavailable. You can still send feedback and diagnostics.");
        await failure.scrollIntoViewIfNeeded();
        await expect(failure).toBeVisible();
        await capture("screenshot-failure");
      }

      const diagnostics = page.getByText("Include diagnostic data", { exact: true });
      const github = page.getByTestId("feedback-open-github");
      const shareReport = page.getByTestId("feedback-share-report");
      await diagnostics.scrollIntoViewIfNeeded();
      await expect(diagnostics).toBeVisible();
      await github.scrollIntoViewIfNeeded();
      await expect(github).toBeVisible();
      await expect(shareReport).toBeVisible();
      await capture("final-actions");

      if (item.state === "ready") {
        await page.getByTestId("feedback-remove-screenshot").click();
        await expect(page.getByTestId("feedback-screenshot-section")).toHaveCount(0);
      }
    });
  }
});
