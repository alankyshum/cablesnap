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
import { test, expect, type Page, type Locator } from "@playwright/test";
import * as path from "path";
import { enablePerWorkerDb, enableImportBackupFixture } from "../helpers";

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

  // BLD-1791: isolate each parallel worker's IndexedDB SQLite DB so the AC #265
  // kill+relaunch persistence test (which seeds rows then reloads expecting them
  // to survive) is not raced by a sibling spec's seedScenario() clearing the
  // shared `cablesnap.db` tables. Registers BEFORE any goto in every test.
  test.beforeEach(async ({ page }, testInfo) => {
    await enablePerWorkerDb(page, testInfo.parallelIndex);
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

    // Capture screenshot via the PRODUCTION navigation push flow (/settings →
    // tap "Advanced Set Types"), NOT a deep-link goto. A deep link leaves
    // expo-router's Stack with no back-history, so @react-navigation gates the
    // back chevron off (NativeStackView: canGoBack === headerBack != null) and
    // the audit captures a chevron-less header — the BLD-1668 → BLD-1769
    // recurring false positive. Pushing from /settings gives the Stack a
    // previous route, so the back chevron renders exactly as real users see it.
    //
    // BLD-1261 flex guard (Platform.OS !== "web") removes the flex: 1
    // constraint on web so the HTML document height equals content height and
    // fullPage captures every entry at narrow viewports (390 px) where the
    // Myo-reps text wraps past 844 px.
    const viewport = testInfo.project.name;
    const screenshotPath = path.join(OUT_DIR, `advanced-sets-help-${viewport}.png`);
    await page.goto("/settings");
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    const helpLinkForShot = page.getByText("Advanced Set Types").first();
    await helpLinkForShot.scrollIntoViewIfNeeded();
    await expect(helpLinkForShot).toBeVisible({ timeout: 5_000 });
    await helpLinkForShot.click();
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(screenshotPath).toBeTruthy();
  });

  // BLD-1261 — harness renders all content without truncation (no bounded ScrollView).
  // Verifies the Myo-reps full description text is present so the narrow-viewport
  // screenshot captures the complete sentence (previously clipped at "small clusters of 3–").
  test("harness renders all help entries including full Myo-reps description (BLD-1261)", async ({
    page,
  }) => {
    // BLD-1943: `__SKIP_ONBOARDING__` must be set before navigation so the root
    // layout's `useAppInit` bypasses the DB onboarding check. Without it,
    // `isOnboardingComplete()` returns false on a fresh worker DB, causing the
    // root layout to Redirect to /onboarding/welcome — the harness component
    // never mounts and `data-test-ready` is never set, timing out at 10 s.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });
    await page.goto("/__test__/advanced-sets");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({ timeout: 30_000 });

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

  // BLD-1769 — DOM-level navigation-header regression guard (web), parameterized
  // over every settings sub-screen the audit covers.
  //
  // The guard asserts, in the live web DOM, that each affected settings
  // sub-screen renders BOTH:
  //   1. a visible page title — <h1 role="heading" aria-level="1">  (HeaderTitle)
  //   2. a visible, working back control — on web @react-navigation's
  //      HeaderBackButton renders as <a role="link" aria-label="…, back">
  //      (react-native-web makes it an anchor because the button gets an href).
  //      The accessible name is computed from the PREVIOUS route, so in the
  //      /settings push flow it is "(tabs), back".
  //
  // Why this test exists and why it is shaped this way:
  //   - The BLD-1668 guard (__tests__/navigation-headers.test.ts) only asserts
  //     the SCREEN_CONFIGS *object* has the entry — it never renders the screen,
  //     so it passed while the audit kept flagging a "missing header". A
  //     config-only assertion is NOT an acceptable sole guard (it is exactly
  //     what let this recur — BLD-1668 → BLD-1769). These are real DOM
  //     assertions that mount each production route.
  //   - The back-control assertion REQUIRES the push flow, not
  //     page.goto("/settings/<route>"): a deep link leaves the Stack with no
  //     back-history, so canGoBack === false and the back control is (correctly)
  //     not rendered. The push flow is the real user path and the only way the
  //     back control exists — so each case would FAIL on a deep-link-only
  //     capture (verified out-of-band: on the deep-link path the aria-label$=back
  //     link count is 0 for every route here, so the toHaveCount(1) guard fails),
  //     which is the proof that it guards the actual production affordance rather
  //     than being a config-only false pass.
  //   - It also confirms the back control FUNCTIONS (navigates away from the
  //     sub-screen), not merely that it paints.
  //
  // Coverage of all five affected settings sub-screens (BLD-1769 AC):
  //   advanced-sets, gym-profiles, macro-coach, backups  → full push-flow guard
  //     below (title + working back control), reached via their real production
  //     entry control on /settings.
  //   import-backup → full push-flow guard in the dedicated test further down.
  //     Its only production entry is the OS file picker ("Import data" →
  //     pickImportBackup → category sheet → router.push), which can't be driven
  //     headless. Per the BLD-526 exercises-fixture precedent, a
  //     navigator.webdriver-guarded fixture (window.__E2E_IMPORT_BACKUP_FIXTURE__,
  //     injected via enableImportBackupFixture) replaces ONLY the picker call, so
  //     the real category-sheet → router.push path runs and the Stack gets the
  //     back-history the back affordance needs. It then asserts the SAME visible
  //     title + working back control as the four routes here.

  // Shared assertion for the BLD-1769 nav-header guard: given a sub-screen that
  // has just been reached via a real expo-router push (so the Stack has
  // back-history), assert in the live web DOM that it renders (1) a visible <h1>
  // header title and (2) a visible, UNIQUE, working back control, then activate
  // the back control and confirm it navigates away (title disappears).
  //
  // The back control on web is @react-navigation's HeaderBackButton, which
  // react-native-web renders as <a role="link"> (it gets an href). Its
  // accessible name is computed from the PREVIOUS route, so we match by
  // role=link + aria-label ending in "back" (case-insensitive). toHaveCount(1)
  // guarantees a future content link whose label ends in "back" can't silently
  // satisfy the guard. `clickStrategy` mirrors the entry strategy: some screens
  // surface overlay chrome (toasts / tab-bar) in the headless static build that
  // blocks a real click on the top-of-screen chevron, so a synthetic dispatch
  // fires the same anchor click handler a user tap would.
  async function assertVisibleTitleAndWorkingBack(
    page: Page,
    headerTitle: string,
    clickStrategy: "press" | "dispatch",
  ): Promise<void> {
    // (1) Header title is a real, visible DOM heading on web.
    const heading = page.getByRole("heading", { level: 1, name: headerTitle });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // (2) Back control present, visible, and unique.
    const backControl = page
      .getByRole("link")
      .and(page.locator('[aria-label$="back" i]'));
    await expect(backControl).toHaveCount(1, { timeout: 10_000 });
    await expect(backControl).toBeVisible({ timeout: 5_000 });

    // (3) The back control actually works: activating it leaves the sub-screen.
    if (clickStrategy === "dispatch") {
      await backControl.dispatchEvent("click");
    } else {
      await backControl.click();
    }
    await expect(heading).toBeHidden({ timeout: 10_000 });
  }

  type SettingsHeaderCase = {
    /** Expo Router route name (matches SCREEN_CONFIGS / the URL path tail). */
    route: string;
    /** Accessible name of the control on /settings that pushes this route. */
    entryControlName: string;
    /** The exact title @react-navigation renders as the <h1> header heading. */
    headerTitle: string;
    /**
     * Locator for a body element that proves we mounted the right sub-screen
     * (not a header-only shell). Provided as a factory so each case can pick the
     * most reliably-visible element — react-native-web wraps text in nested
     * spans where outer wrappers can compute as hidden, so role-based locators
     * (e.g. a button) are preferred over raw getByText for async/empty bodies.
     */
    bodyMarker: (page: Page) => Locator;
    /**
     * How to activate the entry control. "press" = normal Playwright click.
     * "dispatch" = synthetic DOM click event, needed for the "View all backups"
     * button which sits at the bottom of the settings list behind the tab-bar
     * overlay, so Playwright's actionability check can never land a real click
     * even after scrollIntoViewIfNeeded. dispatchEvent still triggers the real
     * onPress → router.push, so the navigation (and resulting back-history) is
     * identical to a user tap.
     */
    clickStrategy: "press" | "dispatch";
  };

  const SETTINGS_HEADER_CASES: SettingsHeaderCase[] = [
    {
      route: "settings/advanced-sets",
      entryControlName: "Open advanced set types help",
      headerTitle: "Advanced Set Types",
      // The "Rest-pause" section title on the help screen.
      bodyMarker: (page) =>
        page.getByText("Rest-pause", { exact: true }).first(),
      clickStrategy: "press",
    },
    {
      route: "settings/gym-profiles",
      entryControlName: "Open gym profiles settings",
      headerTitle: "Gym Profiles",
      // Body copy unique to the gym-profiles screen (not the header heading).
      bodyMarker: (page) =>
        page
          .getByText(/Add gyms here if you train across multiple locations/i)
          .first(),
      clickStrategy: "press",
    },
    {
      route: "settings/macro-coach",
      entryControlName: "Open Adaptive Macro Coach settings",
      // macro-coach overrides the SCREEN_CONFIGS "Macro Coach" title per
      // internal flow state; a fresh session lands on the "main" screen whose
      // <Stack.Screen> sets this title (app/settings/macro-coach.tsx).
      headerTitle: "Adaptive Macro Coach",
      // The enable toggle on the main macro-coach screen — a reliably-visible
      // interactive element distinct from the header.
      bodyMarker: (page) =>
        page.getByRole("switch", { name: "Enable Adaptive Macro Coach" }),
      clickStrategy: "press",
    },
    {
      route: "settings/backups",
      entryControlName: "View all backups",
      headerTitle: "Backups",
      // The backups list loads async and, with no seeded backups, settles on an
      // empty state whose text wrapper can compute as hidden under
      // react-native-web. The "Backup Now" action is a reliably-visible button
      // on that screen, so use it as the mount marker.
      bodyMarker: (page) =>
        page.getByRole("button", { name: "Create a backup now" }),
      clickStrategy: "dispatch",
    },
  ];

  for (const c of SETTINGS_HEADER_CASES) {
    test(`web header renders visible title + working back control via push flow — ${c.route} (BLD-1769)`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        w.__SKIP_ONBOARDING__ = true;
      });

      // Production push path: /settings → activate the row that pushes the route.
      // The static web bundle cold-boots the whole app on this first navigation;
      // give it a generous window to render the settings list container.
      await page.goto("/settings");
      await expect(page.getByTestId("settings-scroll-view")).toBeVisible({
        timeout: 30_000,
      });

      const entry = page.getByRole("button", { name: c.entryControlName });
      await entry.scrollIntoViewIfNeeded();
      await expect(entry).toBeVisible({ timeout: 10_000 });
      if (c.clickStrategy === "dispatch") {
        // Nudge the RN ScrollView up so the row clears the tab-bar overlay, then
        // fire a synthetic click — see SettingsHeaderCase.clickStrategy docs.
        await page.evaluate(() => {
          const sv = document.querySelector(
            '[data-testid="settings-scroll-view"]',
          ) as HTMLElement | null;
          if (sv) sv.scrollTop = Math.max(0, sv.scrollTop - 120);
        });
        await page.waitForTimeout(500);
        await entry.dispatchEvent("click");
      } else {
        await entry.click();
      }

      // Landed on the sub-screen URL (push, not a hard deep-link).
      await expect(page).toHaveURL(new RegExp(`/${c.route}(\\?|$|/)`), {
        timeout: 15_000,
      });

      // Sub-screen body actually mounted (not a blank/error shell). Each case
      // supplies the most reliably-visible body element via its bodyMarker
      // factory (see SettingsHeaderCase.bodyMarker).
      await expect(c.bodyMarker(page).first()).toBeVisible({ timeout: 10_000 });

      // Visible title + visible, unique, working back control (the BLD-1769 AC).
      await assertVisibleTitleAndWorkingBack(page, c.headerTitle, c.clickStrategy);
    });
  }

  // BLD-1769 — import-backup nav-header guard (web), via the REAL production
  // push flow (matches the four routes above; no hard deep-link).
  //
  // /settings/import-backup has no standalone navigable row — its only
  // production entry is "Import data" on /settings → pickImportBackup → category
  // sheet → router.push("/settings/import-backup", { backupJson }). pickImportBackup
  // opens an OS file picker that Playwright cannot drive headless, which is why
  // earlier revisions fell back to a deep-link page.goto and could only assert
  // the title (a deep link leaves the Stack with no back-history, so the back
  // chevron is correctly absent — making it impossible to guard the back
  // affordance, the exact recurrence class BLD-1769 must close).
  //
  // Following the BLD-526 exercises-fixture precedent, enableImportBackupFixture
  // injects window.__E2E_IMPORT_BACKUP_FIXTURE__ (honored only under
  // navigator.webdriver). pickImportBackup returns that fixtured backup INSTEAD
  // of opening the picker, so the rest of the real flow — category detection,
  // the "Choose what to import" sheet, "Import Selected", router.push — runs
  // unchanged and gives expo-router's Stack genuine back-history. We then assert
  // the SAME visible title + visible, unique, working back control as the four
  // sibling routes.
  test("web header renders visible title + working back control via push flow — settings/import-backup (BLD-1769)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    // A minimal valid v7 backup with one populated category, so pickImportBackup
    // succeeds, getPresentBackupCategories returns ["exercises"] (the sheet
    // opens), and the import-backup screen renders its real Import Preview shell
    // (whose only buttons are "Cancel import" / "Import N records" — neither ends
    // in "back", so they cannot collide with the header back-control locator).
    const backupJson = JSON.stringify({
      version: 7,
      app_version: "test",
      exported_at: new Date().toISOString(),
      data: {
        exercises: {
          exercises: [{ id: "e2e-import-fixture-1", name: "E2E Fixture Exercise" }],
        },
      },
    });
    await enableImportBackupFixture(page, backupJson);

    // Boot the app (cold deep-link to a sub-route renders blank).
    await page.goto("/settings");
    await expect(page.getByTestId("settings-scroll-view")).toBeVisible({
      timeout: 30_000,
    });

    // Production entry: "Import data" → pickImportBackup (returns the fixture) →
    // category sheet opens. The sheet open is an async chain (fixture read →
    // openImportSheet setState → BottomSheet Modal mount + spring), so on the
    // headless static build the very first click can occasionally land mid-boot
    // and not open the sheet. Retry the entry click (real, then synthetic
    // dispatch) until the sheet's "Import Selected" confirm appears — the same
    // robustness pattern the backups case uses for overlay-obscured controls.
    const importButton = page.getByRole("button", { name: "Import data" });
    await importButton.scrollIntoViewIfNeeded();
    await expect(importButton).toBeVisible({ timeout: 10_000 });

    // BackupCategorySheet's buttons render as <div aria-label="…"> WITHOUT
    // accessibilityRole="button" (unlike the settings rows), so match the
    // accessible name via getByLabel rather than getByRole("button").
    const confirmImport = page.getByLabel("Import Selected", { exact: true });
    await expect(async () => {
      if (!(await confirmImport.isVisible())) {
        // Prefer a real click; fall back to a synthetic dispatch which fires the
        // same onPress even if the button is briefly obscured during boot.
        await importButton.click().catch(async () => {
          await importButton.dispatchEvent("click");
        });
      }
      await expect(confirmImport).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // Confirm the import to fire the real router.push.
    await confirmImport.click();

    // Landed on the production route via push (so the Stack has back-history).
    await expect(page).toHaveURL(/\/settings\/import-backup(\?|$|\/)/, {
      timeout: 15_000,
    });

    // Sub-screen body actually mounted (the import-preview "Import N records"
    // action button — this one DOES set accessibilityRole="button"), then the
    // BLD-1769 AC: visible title + working back control.
    await expect(
      page.getByRole("button", { name: /^Import \d+ records$/ }),
    ).toBeVisible({ timeout: 10_000 });
    await assertVisibleTitleAndWorkingBack(page, "Import Backup", "press");
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
  // The web DB primary path opens an IndexedDB-backed SQLite database via
  // `openDatabaseAsync(resolveDbName())` (lib/db/helpers.ts) — data SURVIVES
  // page.reload() within the same browser context. Under Playwright the name is
  // this worker's isolated `cablesnap-e2e-w<idx>.db` (BLD-1791, via the
  // beforeEach above), so a concurrent worker's seedScenario() table-clear can't
  // wipe these rows between the seed and the post-reload assertion.
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

    // After reload there is NO data-test-ready signal (seedScenario is a no-op
    // by design), so we must wait on real content. BLD-1791: on reload the
    // expo-sqlite WASM worker is COLD — useSessionDetail's drizzle sync reads
    // race the worker warm-up (BLD-1636), and under multi-worker CPU contention
    // that warm-up + first read can exceed a tight timeout. The failure mode is
    // NOT data loss (the persisted `workout_sessions` row renders the screen
    // header immediately); it is the rest_pause set chip rendering a few seconds
    // later once the cold worker drains the sets query. So we anchor on the
    // session header first (proves persistence + screen mount), THEN assert the
    // chip and decomposition with a cold-worker-tolerant timeout.
    await expect(
      page.getByRole("heading", { name: "Advanced Sets E2E Session" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("RP")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("100 × 8+3+2 (13)")).toBeVisible({
      timeout: 20_000,
    });
  });
});
