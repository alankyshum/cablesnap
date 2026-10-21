import { expect, test } from "@playwright/test";
import { dismissUpdateDialog, skipOnboarding } from "./helpers";

const cases = [
  { name: "narrow-light-ready", width: 320, height: 720, theme: "light" as const, state: "ready" },
  { name: "narrow-dark-failed", width: 320, height: 720, theme: "dark" as const, state: "failed" },
  { name: "wide-light-failed", width: 768, height: 900, theme: "light" as const, state: "failed" },
  { name: "wide-dark-ready", width: 768, height: 900, theme: "dark" as const, state: "ready" },
];

test.describe("GH-963 shake feedback visual evidence", () => {
  for (const item of cases) {
    test(item.name, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "One project renders the explicit viewport matrix");
      await page.setViewportSize({ width: item.width, height: item.height });
      await page.emulateMedia({ colorScheme: item.theme });
      await skipOnboarding(page);
      await page.goto(`/feedback?source=shake&type=bug&screenshotAudit=${item.state}`);
      await dismissUpdateDialog(page);

      await expect(page.getByText("Report what you saw")).toBeVisible();
      await expect(page.getByText("Bug Report", { exact: true })).toBeVisible();
      const form = page.getByTestId("feedback-form");
      await expect(form).toBeVisible();
      expect((await form.boundingBox())?.width).toBeLessThanOrEqual(600);

      if (item.state === "ready") {
        await expect(page.getByText("Screenshot captured. Review it before sharing.")).toBeVisible();
        const consent = page.getByTestId("feedback-screenshot-consent").locator('input[type="checkbox"]');
        await expect(consent).not.toBeChecked();
        await expect(page.getByTestId("feedback-share-screenshot")).toHaveAttribute("aria-disabled", "true");
      } else {
        await expect(page.getByText("Screenshot unavailable. You can still send feedback and diagnostics.")).toBeVisible();
      }

      await page.screenshot({ path: testInfo.outputPath(`${item.name}.png`), fullPage: true });
    });
  }
});
