import { test, expect } from "@playwright/test";
import {
  aiCoachBackupFixture,
  enableImportBackupFixture,
  skipOnboarding,
} from "./helpers";

test.describe("AI Coach backup import", () => {
  test("v8 fixture exposes the AI Coach category and session/message counts", async ({ page }) => {
    await enableImportBackupFixture(page, aiCoachBackupFixture());
    await skipOnboarding(page);

    await page.getByRole("button", { name: /import data/i }).click();
    await expect(page.getByText(/choose what to import/i)).toBeVisible();
    await expect(page.getByText(/AI Coach/i)).toBeVisible();
    await expect(page.getByText(/1.*session.*1.*message/i)).toBeVisible();
  });
});
