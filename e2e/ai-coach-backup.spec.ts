import { test, expect } from "@playwright/test";
import {
  aiCoachBackupFixture,
  enableImportBackupFixture,
  navigateTo,
  skipOnboarding,
  dismissUpdateDialog,
} from "./helpers";

test.describe("AI Coach backup import", () => {
  test("v8 fixture exposes AI Coach sessions, durable drafts, revisions, and messages", async ({ page }) => {
    const backup = JSON.parse(aiCoachBackupFixture()) as {
      version: number;
      data: { ai_coach: Record<string, unknown[]> };
    };
    expect(backup.version).toBe(8);
    expect(backup.data.ai_coach.coach_sessions).toHaveLength(1);
    expect(backup.data.ai_coach.coach_workout_drafts).toHaveLength(1);
    expect(backup.data.ai_coach.coach_workout_draft_revisions).toHaveLength(1);
    expect(backup.data.ai_coach.coach_messages).toHaveLength(1);
    await enableImportBackupFixture(page, JSON.stringify(backup));
    await skipOnboarding(page);
    await navigateTo(page, "/settings");
    await dismissUpdateDialog(page);
    const importButton = page.getByRole("button", { name: "Import data" });
    await importButton.scrollIntoViewIfNeeded();
    await expect(importButton).toBeVisible({ timeout: 20_000 });
    await importButton.dispatchEvent("click");
    await expect(page.getByLabel("Import Selected", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Import Selected", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/import-backup/);
    await expect(page.getByText(/choose what to import/i)).toBeVisible();
    await expect(page.getByLabel("AI Coach: 4 records", { exact: true })).toBeVisible();
    await expect(page.getByText(/1.*session.*1.*message/i)).toBeVisible();
  });

  test("older v7 backups remain import-compatible and contain no draft media fields", async ({ page }) => {
    const backup = JSON.parse(aiCoachBackupFixture()) as Record<string, unknown>;
    backup.version = 7;
    const data = backup.data as { ai_coach: Record<string, unknown[]> };
    delete data.ai_coach.coach_workout_drafts;
    delete data.ai_coach.coach_workout_draft_revisions;
    await enableImportBackupFixture(page, JSON.stringify(backup));
    await skipOnboarding(page);
    await navigateTo(page, "/settings");
    await dismissUpdateDialog(page);
    const importButton = page.getByRole("button", { name: "Import data" });
    await importButton.scrollIntoViewIfNeeded();
    await expect(importButton).toBeVisible({ timeout: 20_000 });
    await importButton.dispatchEvent("click");
    await expect(page.getByLabel("Import Selected", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Import Selected", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/import-backup/);
    await expect(page.getByRole("button", { name: /^Import \d+ records$/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Import \d+ records$/ }).click();
    await expect(page.getByText("Import Complete", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(JSON.stringify(backup)).not.toMatch(/uri|base64|exif|location|bytes/i);
  });
});
