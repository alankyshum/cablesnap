/**
 * Scenario spec: advanced-sets (BLD-1176 AC #264 / AC #265 / AC #273).
 *
 * Navigates to Settings → Advanced Set Types help screen via the production
 * mount path (/settings → press "Advanced Set Types") and verifies:
 *
 *  1. The help screen renders with entries for all three advanced set types.
 *  2. None of the forbidden aspirational phrases appear in the rendered text.
 *  3. Screenshots captured at mobile + mobile-narrow viewports.
 *
 * AC #265 — advanced-set data persistence through production session-detail path:
 *  4. A seeded rest_pause set renders via /session/detail/[id] with "RP" chip.
 *  5. After a full page reload (kill+relaunch simulation) the data re-renders.
 *
 * Refs: BLD-1168, BLD-1176.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const SCENARIO = "advanced-sets";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

const FORBIDDEN_PHRASES = [
  "advanced lifters",
  "next level",
  "unlock",
  "serious lifters",
  "take your training to",
];

test.describe("@scenario advanced-sets", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !["mobile", "mobile-narrow"].includes(testInfo.project.name),
      "advanced-sets spec: mobile and mobile-narrow viewports only",
    );
    // All tests in this spec require E2E_USE_STATIC=1 (pre-built bundle served with
    // COOP/COEP/CORP headers).  Without it, `useAppInit` detects
    // `crossOriginIsolated === false` via `webNeedsUnsupportedFallback()` and the
    // root layout renders `<WebUnsupportedScreen>` instead of the normal app tree —
    // no route (including /settings or /settings/advanced-sets) is reachable.
    // Build:  npx expo export -p web --dev --no-minify
    // Run:    E2E_USE_STATIC=1 npx playwright test e2e/scenarios/advanced-sets.spec.ts
    test.skip(
      !process.env.E2E_USE_STATIC,
      "requires E2E_USE_STATIC=1 — dev server lacks COOP/COEP headers, rendering WebUnsupportedScreen instead of the app. See e2e/README.md.",
    );
  });

  test("help screen renders all three advanced set type entries", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    // Navigate via production mount path: /settings → tap "Advanced Set Types"
    await page.goto("/settings");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);

    const helpLink = page.getByText("Advanced Set Types").first();
    await expect(helpLink).toBeVisible({ timeout: 5_000 });
    await helpLink.tap();

    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // Verify all three set types render
    await expect(page.getByText("Rest-pause")).toBeVisible();
    await expect(page.getByText("Cluster")).toBeVisible();
    await expect(page.getByText("Myo-reps")).toBeVisible();
  });

  test("help copy contains no forbidden aspirational phrases", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/settings/advanced-sets");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const bodyText = await page.locator("body").innerText();
    const lowerText = bodyText.toLowerCase();

    for (const phrase of FORBIDDEN_PHRASES) {
      expect(lowerText).not.toContain(phrase);
    }
  });

  test("help screen route survives page reload (static route stability)", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    // First load
    await page.goto("/settings/advanced-sets");
    await expect(page.getByText("Rest-pause", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // Simulate kill + relaunch: reload the page and navigate directly to the route
    await page.reload();
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });
    await page.goto("/settings/advanced-sets");
    await expect(page.getByText("Rest-pause")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Cluster")).toBeVisible();
    await expect(page.getByText("Myo-reps")).toBeVisible();

    // Capture screenshot
    const viewport = testInfo.project.name;
    const screenshotPath = path.join(OUT_DIR, `advanced-sets-help-${viewport}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(screenshotPath).toBeTruthy();
  });

  // AC #265 — advanced set data through production session-detail mount path
  test("rest_pause set renders via production session-detail path (AC #265)", async ({ page }) => {
    await page.addInitScript((scenario) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = scenario;
    }, "advanced-sets");

    await page.goto("/session/detail/scenario-advanced-session-1");

    // Wait for seedScenario() to complete and signal readiness
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // Verify the rest_pause set type chip ("RP") renders
    await expect(page.getByText("RP")).toBeVisible({ timeout: 5_000 });

    // Verify set data (100 kg × 13 reps) renders
    await expect(page.getByText("100 × 13")).toBeVisible();
  });

  // AC #265 — kill+relaunch simulation using real page.reload().
  //
  // The web DB primary path is `openDatabaseAsync("cablesnap.db")` (lib/db/helpers.ts:64)
  // which uses IndexedDB-backed SQLite on Chromium — data SURVIVES page.reload() within
  // the same browser context. The seed gate below exploits sessionStorage (also survives
  // reload) to ensure __TEST_SCENARIO__ is injected ONLY on the first load; on the reload
  // seedScenario() sees guardsAllow()=false (no __TEST_SCENARIO__), skips the clear+re-seed,
  // and useSessionDetail reads previously persisted rows from the IndexedDB DB.
  test("advanced set data survives reload (AC #265 — kill+relaunch via persistent DB)", async ({ page }) => {
    // addInitScript re-runs on every navigation including page.reload().
    // The sessionStorage gate ensures __TEST_SCENARIO__ is injected only once (first load).
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      if (!sessionStorage.getItem("__adv_seeded")) {
        w.__TEST_SCENARIO__ = "advanced-sets";
        sessionStorage.setItem("__adv_seeded", "1");
      }
    });

    // First load: seedScenario() fires, writes rest_pause set to the IndexedDB DB.
    await page.goto("/session/detail/scenario-advanced-session-1");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("RP")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("100 × 13")).toBeVisible();

    // Reload (simulates kill+relaunch):
    //   - addInitScript re-runs, but sessionStorage["__adv_seeded"] = "1" blocks re-injection
    //   - __TEST_SCENARIO__ is not set → guardsAllow()=false → seedScenario() is a no-op
    //   - DB tables are NOT cleared → data persists in IndexedDB
    //   - useSessionDetail queries the same DB → must render the previously seeded session
    await page.reload();
    // No data-test-ready signal (seedScenario didn't run); wait on actual content instead.
    await expect(page.getByText("RP")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("100 × 13")).toBeVisible();
  });
});
