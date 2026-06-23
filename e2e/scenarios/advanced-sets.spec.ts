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
import { enablePerWorkerDb } from "../helpers";

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
  //     capture, which is the proof that it guards the actual production
  //     affordance (see the dedicated pre-fix-path negative test below).
  //   - It also confirms the back control FUNCTIONS (navigates away from the
  //     sub-screen), not merely that it paints.
  //
  // Coverage of all five affected settings sub-screens (BLD-1769 AC):
  //   advanced-sets, gym-profiles, macro-coach, backups  → full push-flow guard
  //     below (title + working back control), reached via their real production
  //     entry control on /settings.
  //   import-backup → covered by the separate render guard further down. Its
  //     only production entry is the file-import sheet ("Import data" →
  //     pickImportBackup → router.push), which opens an OS file picker that
  //     cannot be driven headless; the back-control mechanism it would use is
  //     the SAME shared app/_layout.tsx Stack + SCREEN_CONFIGS chrome that the
  //     four routes above DOM-verify, so it is guarded at the route+title level
  //     plus that shared mechanism. See the comment on that test.

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

      // (1) Header title is a real, visible DOM heading on web.
      const headerTitle = page.getByRole("heading", {
        level: 1,
        name: c.headerTitle,
      });
      await expect(headerTitle).toBeVisible({ timeout: 10_000 });

      // Sub-screen body actually mounted (not a blank/error shell). Each case
      // supplies the most reliably-visible body element via its bodyMarker
      // factory (see SettingsHeaderCase.bodyMarker).
      await expect(c.bodyMarker(page).first()).toBeVisible({ timeout: 10_000 });

      // (2) Back control is present and visible. On web the HeaderBackButton
      // renders as <a role="link"> (react-native-web makes it an anchor because
      // @react-navigation gives it an href). Its accessible name is computed
      // from the PREVIOUS route ("(tabs), back" here) rather than the generic
      // "Go back" default — match by role=link with an aria-label ending in
      // "back" (case-insensitive) so the assertion survives that computed label.
      //
      // Scoping per reviewer note: these sub-screens render exactly one link in
      // the DOM (the header back affordance — verified empirically), so this
      // aria-label-filtered link locator cannot collide with a content link. We
      // assert that uniqueness explicitly so a future content link ending in
      // "back" can't silently satisfy the guard.
      const backControl = page
        .getByRole("link")
        .and(page.locator('[aria-label$="back" i]'));
      await expect(backControl).toHaveCount(1, { timeout: 10_000 });
      await expect(backControl).toBeVisible({ timeout: 5_000 });

      // (3) The back control actually works: activating it leaves the sub-screen
      // (its header title is no longer shown). We assert navigation happened
      // rather than a specific destination — goBack() pops the Stack to whatever
      // the previous route was, which is enough to prove the affordance
      // functions, not just paints.
      //
      // Reuse the case's clickStrategy: the backups screen surfaces stacked
      // "Failed to load backups" toasts in the headless static build (no real
      // filesystem), which overlay the top-of-screen back chevron and block a
      // real click — dispatchEvent fires the anchor's click handler directly,
      // exercising the same navigation a user tap would.
      if (c.clickStrategy === "dispatch") {
        await backControl.dispatchEvent("click");
      } else {
        await backControl.click();
      }
      await expect(headerTitle).toBeHidden({ timeout: 10_000 });
    });
  }

  // BLD-1769 — import-backup header render guard (web).
  //
  // Unlike the four routes above, /settings/import-backup has no standalone
  // navigable row: its only production entry is the file-import sheet
  // ("Import data" on /settings → pickImportBackup → router.push), which opens
  // an OS file picker that Playwright cannot drive headless. Its navigation
  // header is produced by the SAME app/_layout.tsx Stack + SCREEN_CONFIGS
  // (headerShown: true, title: "Import Backup") whose back affordance the four
  // push-flow guards above already DOM-verify.
  //
  // So here we mount the production route and assert its header TITLE paints in
  // the live web DOM (the config-vs-render gap that let BLD-1668 recur). The
  // back control is intentionally NOT asserted here — reaching the route by URL
  // gives the Stack no back-history, so @react-navigation correctly omits the
  // chevron; asserting it would be wrong. Back-affordance coverage for the
  // shared settings header mechanism is provided by the four sibling routes
  // above.
  //
  // The static web bundle renders a blank tree on a *cold* deep-link to a
  // sub-route (the app must boot first), so we boot via /settings, then
  // navigate to the import-backup route with a minimal valid payload.
  test("web header renders visible title — settings/import-backup (BLD-1769)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    // Boot the app first (cold deep-link to a sub-route renders blank).
    await page.goto("/settings");
    await expect(page.getByTestId("settings-scroll-view")).toBeVisible({
      timeout: 30_000,
    });

    // Navigate to the production route. A minimal valid backup payload is
    // supplied so the screen renders its Import Preview shell rather than only
    // the "No backup data provided." fallback — either way the Stack header
    // (title) is what we assert.
    const backupJson = encodeURIComponent(
      JSON.stringify({
        version: 1,
        exported_at: new Date().toISOString(),
        app_version: "test",
        exercises: [],
      }),
    );
    await page.goto(`/settings/import-backup?backupJson=${backupJson}`);
    await expect(page).toHaveURL(/\/settings\/import-backup/, {
      timeout: 15_000,
    });

    const headerTitle = page.getByRole("heading", {
      level: 1,
      name: "Import Backup",
    });
    await expect(headerTitle).toBeVisible({ timeout: 10_000 });
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
