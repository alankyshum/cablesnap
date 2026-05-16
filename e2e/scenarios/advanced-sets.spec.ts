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
    // Scroll into view first — on 320px (mobile-narrow) the settings list may extend
    // below the fold and the element won't be visible until scrolled into view.
    await helpLink.scrollIntoViewIfNeeded();
    await expect(helpLink).toBeVisible({ timeout: 5_000 });
    // Use click() — Playwright mobile projects set viewport only, not hasTouch, so tap() throws.
    await helpLink.click();

    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    // Verify all three set types render.
    // Use { exact: true } + .first() to avoid React Native Web's nested-span strict-mode
    // violation: getByText("Cluster") matches the title span AND every ancestor that
    // contains only "Cluster" as its innerText.
    await expect(page.getByText("Rest-pause", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Cluster", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Myo-reps", { exact: true }).first()).toBeVisible();
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
    await expect(page.getByText("Rest-pause", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Cluster", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Myo-reps", { exact: true }).first()).toBeVisible();

    // Capture screenshot from the production route — BLD-1261 flex guard
    // (Platform.OS !== "web") removes the flex: 1 constraint on web so the
    // HTML document height equals content height and fullPage captures every
    // entry at narrow viewports (390 px) where Myo-reps text wraps past 844 px.
    const viewport = testInfo.project.name;
    const screenshotPath = path.join(OUT_DIR, `advanced-sets-help-${viewport}.png`);
    await page.goto("/settings/advanced-sets");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(screenshotPath).toBeTruthy();
  });

  // BLD-1261 — harness renders all content without truncation (no bounded ScrollView).
  // Verifies the Myo-reps full description text is present so the narrow-viewport
  // screenshot captures the complete sentence (previously clipped at "small clusters of 3–").
  test("harness renders all help entries including full Myo-reps description (BLD-1261)", async ({
    page,
  }) => {
    await page.goto("/__test__/advanced-sets");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 10_000 });

    // All three section titles visible
    await expect(page.getByText("Rest-pause", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Cluster", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Myo-reps", { exact: true }).first()).toBeVisible();

    // Full Myo-reps description must be rendered (previously truncated at "3–")
    await expect(
      page
        .getByText(/small clusters of 3.5 reps/, { exact: false })
        .first(),
    ).toBeVisible();
  });

  // AC #265 — advanced set data through production session-detail mount path.
  // Requires E2E_USE_STATIC=1 (pre-built bundle with COOP/COEP headers) so
  // SharedArrayBuffer is available for the expo-sqlite web worker. Without it,
  // useAppInit short-circuits (webNeedsUnsupportedFallback=true) and seedScenario()
  // never runs — body[data-test-ready='true'] is never set. See e2e/README.md.
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

    // Verify set data renders (rest_pause shows total reps decomposed: weight × seg1+seg2+seg3 (total))
    await expect(page.getByText("100 × 8+3+2 (13)")).toBeVisible();
  });

  // AC #265 — kill+relaunch simulation using real page.reload().
  //
  // The web DB primary path is `openDatabaseAsync("cablesnap.db")` (lib/db/helpers.ts:64)
  // which uses IndexedDB-backed SQLite on Chromium — data SURVIVES page.reload() within
  // the same browser context.
  //
  // Seed strategy: use page.evaluate() to inject __TEST_SCENARIO__ into the LIVE page
  // BEFORE useAppInit fires (via addInitScript for first load only), then on reload
  // __TEST_SCENARIO__ is NOT set → guardsAllow()=false → seedScenario() is a no-op
  // → DB tables are NOT cleared → data persists in IndexedDB → useSessionDetail
  // reads the previously seeded rows, proving true kill+relaunch persistence.
  //
  // addInitScript re-runs on every navigation including page.reload(). To inject on
  // first load only without sessionStorage (which may not be available at addInitScript
  // execution time), we use a window-level guard variable set by addInitScript itself.
  // Requires E2E_USE_STATIC=1 — see comment on the AC #265 test above.
  test("advanced set data survives reload (AC #265 — kill+relaunch via persistent DB)", async ({ page }) => {
    // addInitScript re-runs on every navigation. Use a window-level boolean guard
    // (__adv_seeded) set on first run to prevent __TEST_SCENARIO__ injection on reload.
    // This is reliable because window globals are cleared on page.reload() — so on
    // the reload the guard doesn't exist, but we also don't set __TEST_SCENARIO__ there.
    // Wait — window IS cleared on reload, so __adv_seeded won't persist. Use a different
    // approach: inject via a dedicated addInitScript that gates on a flag it sets itself,
    // using a closure variable that persists only within the addInitScript registration.
    //
    // The cleanest approach: addInitScript runs BEFORE page JS. We inject __TEST_SCENARIO__
    // on page 1 (first goto), then call page.evaluate() to clear it before reload so the
    // reload load sees no __TEST_SCENARIO__.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = "advanced-sets";
    });

    // First load: seedScenario() fires, writes rest_pause set to the IndexedDB DB.
    await page.goto("/session/detail/scenario-advanced-session-1");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("RP")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("100 × 8+3+2 (13)")).toBeVisible();

    // Clear __TEST_SCENARIO__ in the live page BEFORE reload.
    // addInitScript re-runs on reload and would re-inject it — override by having the
    // reload addInitScript check a sentinel we set here via evaluate().
    // Simplest correct approach: add a SECOND addInitScript that clears __TEST_SCENARIO__
    // if the reload sentinel is present in sessionStorage (set below via evaluate).
    await page.evaluate(() => {
      sessionStorage.setItem("__e2e_adv_seeded", "1");
    });

    // Register a second addInitScript: on reload, sessionStorage["__e2e_adv_seeded"]
    // will be present (survives reload), clearing __TEST_SCENARIO__ before app JS runs.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__e2e_adv_seeded")) {
        const w = window as unknown as Record<string, unknown>;
        delete w.__TEST_SCENARIO__;
      }
    });

    // Reload (simulates kill+relaunch):
    // - addInitScript #1 sets __TEST_SCENARIO__ = "advanced-sets"
    // - addInitScript #2 immediately deletes it (sessionStorage gate triggers)
    // - net result: no __TEST_SCENARIO__ → guardsAllow()=false → seedScenario() no-op
    // - IndexedDB rows from first load persist → useSessionDetail renders them
    await page.reload();
    // No data-test-ready signal (seedScenario didn't run); wait on actual content.
    await expect(page.getByText("RP")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("100 × 8+3+2 (13)")).toBeVisible();
  });
});
