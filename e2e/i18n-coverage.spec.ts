import { test, expect, type Page } from "@playwright/test";
import { enableImportBackupFixture, skipOnboarding } from "./helpers";
import {
  ALL_SCREENS,
  ONBOARDING_SCREENS,
  type Screen,
} from "./route-registry";

type Locale = "en-US" | "en-GB" | "zh-TW" | "zh-CN";

const LOCALES: Locale[] = ["en-US", "en-GB", "zh-TW", "zh-CN"];

// A failed Lingui lookup renders its explicit id. Keep this deliberately
// narrower than a generic dotted-string check so dates and domain values do not
// produce false positives.
const RAW_MESSAGE_ID = /\b[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*){2,}\b/g;
const CJK = /[\u3400-\u9fff]/;

function fixtureReason(path: string): string | undefined {
  if (path === "/settings/import-workouts") {
    return "requires an imported workout file and native/file-system picker data";
  }
  return undefined;
}

function scenarioFor(path: string): string | undefined {
  if (
    path === "/session/scenario-session-1" ||
    path === "/session/detail/scenario-session-1" ||
    path === "/session/summary/scenario-session-1"
  ) {
    return "completed-workout";
  }
  return undefined;
}

async function selectLocale(page: Page, locale: Locale) {
  // skipOnboarding owns the initial `/` navigation. Reuse that booted SPA and
  // enter Settings client-side before opening the language dropdown.
  const settingsTab = page.getByRole("tab", { name: /Settings|設定|设置/ });
  await expect(settingsTab).toBeVisible({ timeout: 30_000 });
  await settingsTab.click();
  await expect(page.getByTestId("settings-tile-language")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("language-picker-trigger").click();
  await expect(page.getByTestId(`language-option-${locale}`)).toBeVisible({ timeout: 10_000 });
  const option = page.getByTestId(`language-option-${locale}`);
  await option.click();
  // setLanguage persists asynchronously; wait for the SQLite write before the
  // next navigation re-creates LanguageProvider and reads the preference.
  await page.waitForTimeout(2_000);
}

async function navigateInSpa(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForTimeout(800);
}

async function importFixtureAndOpen(page: Page, path: string) {
  await navigateInSpa(page, "/settings");
  const importButton = page.getByRole("button", { name: /Import data|匯入資料|導入資料|导入资料|导入数据/ }).first();
  await expect(importButton).toBeVisible({ timeout: 10_000 });
  await importButton.click();
  await expect(page.getByLabel("Import Selected", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Import Selected", { exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/import-backup/);
  await navigateInSpa(page, path);
}

async function assertScreen(page: Page, screen: Screen, locale: Locale) {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  if (screen.path === "/strava-callback") {
    const connectingCopy: Record<Locale, string> = {
      "en-US": "Connecting to Strava…",
      "en-GB": "Connecting to Strava…",
      "zh-TW": "正在連接至Strava...",
      "zh-CN": "正在连接至Strava...",
    };
    await page.goto(screen.path, { waitUntil: "commit" });
    await expect(page.getByText(connectingCopy[locale], { exact: true })).toBeVisible({ timeout: 10_000 });
  } else {
    await navigateInSpa(page, screen.path);
  }
  const body = page.locator("body");
  await expect(body).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => (await body.innerText()).trim(), {
      timeout: 10_000,
      message: `${screen.name} rendered no visible content`,
    })
    .not.toBe("");

  const visibleText = (await body.innerText()).trim();
  expect(pageErrors, `${screen.name} page errors`).toHaveLength(0);
  expect(
    visibleText.match(RAW_MESSAGE_ID) ?? [],
    `${screen.name} leaked raw Lingui message ids`,
  ).toHaveLength(0);

  if (locale === "zh-TW" || locale === "zh-CN") {
    expect(
      CJK.test(visibleText),
      `${screen.name} contains no CJK copy in ${locale}; likely fell back to English`,
    ).toBe(true);
  }
}

async function coverScreen(screen: Screen, locale: Locale, page: Page) {
  const skipReason = fixtureReason(screen.path);
  if (skipReason) {
    test.skip(true, `Fixture-dependent route: ${skipReason}`);
    return;
  }

  await skipOnboarding(page);
  await selectLocale(page, locale);

  if (screen.path === "/settings/import-backup") {
    await importFixtureAndOpen(page, screen.path);
    await assertScreen(page, screen, locale);
    return;
  }
  if (screen.path === "/nutrition/template/starter-tpl-1") {
    await importFixtureAndOpen(page, screen.path);
    await assertScreen(page, screen, locale);
    return;
  }
  await assertScreen(page, screen, locale);
}

for (const screen of [...ALL_SCREENS, ...ONBOARDING_SCREENS]) {
  for (const locale of LOCALES) {
    test(`${locale}: ${screen.name} (${screen.path})`, async ({ page }, testInfo) => {
      await page.addInitScript((name) => {
        (window as unknown as Record<string, unknown>).__E2E_DB_NAME__ = name;
      }, `cablesnap-i18n-${testInfo.testId}`);
      const scenario = scenarioFor(screen.path);
      if (scenario) {
        await page.addInitScript((name) => {
          const w = window as unknown as Record<string, unknown>;
          w.__SKIP_ONBOARDING__ = true;
          w.__TEST_SCENARIO__ = name;
        }, scenario);
      }
      await enableImportBackupFixture(page, JSON.stringify({
        version: 7,
        app_version: "e2e",
        exported_at: "2026-01-01T00:00:00.000Z",
        data: {
          exercises: { exercises: [{ id: "e2e-import-1", name: "E2E Import Exercise" }] },
          workout_history: {
            workout_sessions: [{
              id: "scenario-day-session-1",
              template_id: null,
              name: "E2E Quick Sets",
              started_at: 1767225600000,
              clock_started_at: null,
              completed_at: 1767225660000,
              duration_seconds: 60,
              notes: "",
              import_batch_id: "e2e-i18n-day-session",
              kind: "day_session",
              day_session_exercise_id: "e2e-import-1",
              day_session_date: "2026-01-01",
            }],
            workout_sets: [{
              id: "e2e-day-session-set-1",
              session_id: "scenario-day-session-1",
              exercise_id: "e2e-import-1",
              set_number: 1,
              weight: 20,
              reps: 10,
              completed: 1,
              completed_at: 1767225660000,
              rpe: null,
              notes: "",
              set_type: "normal",
              side: null,
            }],
          },
          nutrition: {
            food_entries: [{ id: "e2e-food-1", name: "E2E Food", calories: 100, protein: 10, carbs: 10, fat: 2, serving_size: "1 serving", is_favorite: 0, created_at: 1 }],
            meal_templates: [{ id: "starter-tpl-1", name: "E2E Nutrition Template", meal: "snack", cached_calories: 100, cached_protein: 10, cached_carbs: 10, cached_fat: 2, last_used_at: null, created_at: 1, updated_at: 1 }],
            meal_template_items: [{ id: "e2e-meal-item-1", template_id: "starter-tpl-1", food_entry_id: "e2e-food-1", servings: 1, sort_order: 0 }],
          },
        },
      }));
      // The acceptance matrix is route × locale, not route × viewport. Keep
      // this oracle to one deterministic browser project; design-quality owns
      // the viewport matrix.
      if (testInfo.project.name !== "mobile") {
        test.skip(true, "I18n coverage runs once in the mobile project");
        return;
      }
      if (ONBOARDING_SCREENS.includes(screen)) {
        // Onboarding routes are intentionally navigated directly after the
        // locale is selected; the normal skip flag would hide these screens.
        await skipOnboarding(page);
        await selectLocale(page, locale);
        await navigateInSpa(page, screen.path);
        await assertScreen(page, screen, locale);
        return;
      }
      await coverScreen(screen, locale, page);
    });
  }
}
