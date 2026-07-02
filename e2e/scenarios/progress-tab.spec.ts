/**
 * Scenario spec: progress-tab.
 *
 * Regression-guard for the Progress tab (/progress). Navigates to the route,
 * captures top + bottom scroll positions across all four store viewports, and
 * asserts the progress screen's primary container testID is mounted. Includes
 * a hard crash guard: the test FAILS if a `pageerror` fires or a React
 * error-boundary / crash-overlay testID is attached.
 *
 * The store-fold7 (712×853) viewport is the CRITICAL regression surface for
 * this spec — BLD-2074 and BLD-2078 both manifested as a crash overlay on the
 * Progress tab exclusively on the Z Fold6 inner screen (712px wide). That
 * crash was undetected until a store screenshot revealed it.
 *
 * Does NOT require a seeded scenario — the progress screen renders an
 * empty-state when no workout data exists. Skips onboarding via
 * window.__SKIP_ONBOARDING__.
 *
 * Both a "top" and "bottom" scroll-position shot are captured per viewport
 * (mirroring settings.spec.ts BLD-1124 pattern).
 *
 * Three CVD-emulated variants (deuteranopia / protanopia / tritanopia) are
 * also captured for the "bottom" shot via `captureWithCvd`.
 *
 * Structural assertion:
 *   - "progress-screen-container" testID is attached after page load (guards
 *     the primary container introduced in BLD-2357).
 *   - Crash guard: any `pageerror` or `data-testid="react-crash-overlay"`
 *     element causes an immediate test failure.
 *
 * Refs: BLD-2074, BLD-2078, BLD-2357
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { captureWithCvd } from "./capture-with-cvd";

const SCENARIO = "progress-tab";
const OUT_DIR = path.resolve(
  __dirname,
  "../../.pixelslop/screenshots/scenarios",
  SCENARIO,
);

test.describe("@scenario progress-tab", () => {
  // BLD-2357 requires the same 4 viewports as settings.spec.ts (BLD-1124 AC1):
  //   mobile        (390×844)  ≈ iPhone 14
  //   mobile-narrow (320×640)  ≈ iPhone SE 3rd gen
  //   store-pixel9  (412×924)  ≈ Pixel 6a
  //   store-fold7   (712×853)  ≈ Z Fold6 inner screen  ← BLD-2074/2078 crash surface
  const ALLOWED_PROJECTS = new Set([
    "mobile",
    "mobile-narrow",
    "store-pixel9",
    "store-fold7",
  ]);
  // eslint-disable-next-line no-empty-pattern -- Playwright 1.59 requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !ALLOWED_PROJECTS.has(testInfo.project.name),
      "BLD-2357: only run on SE3 / iPhone 14 / Pixel 6a / Fold6 viewports",
    );
  });

  test("captures progress top (tabs + initial segment)", async ({ page }, testInfo) => {
    // Crash guard: any unhandled JS error fails the test immediately.
    // This is the guard BLD-2074/2078 would have tripped had it existed.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress");

    // Wait for the primary container to mount — this also guards empty-state
    // render so we don't capture a blank frame.
    await expect(page.getByTestId("progress-screen-container")).toBeVisible({
      timeout: 20_000,
    });

    // Double rAF to guarantee the compositor has committed a frame.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          void document.documentElement.offsetHeight;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await page.waitForTimeout(300);

    // Crash guard assertion: if any pageerror fired during load, fail now.
    expect(
      pageErrors,
      `pageerror(s) detected on /progress — crash guard tripped (Refs: BLD-2074, BLD-2078):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);

    // Structural assertion: confirm no crash overlay is attached.
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay testID is attached — progress screen crashed (Refs: BLD-2074, BLD-2078)",
    ).not.toBeAttached();

    const viewport = testInfo.project.name;
    const screenshotPath = path.join(
      OUT_DIR,
      `progress-top-${viewport}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(screenshotPath).toBeTruthy();
  });

  test("captures progress bottom (below-fold segment content + CVD variants)", async ({ page }, testInfo) => {
    // Crash guard (same pattern as top test — independent page context).
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress");

    await expect(page.getByTestId("progress-screen-container")).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForTimeout(500);

    // Crash guard assertion before scrolling.
    expect(
      pageErrors,
      `pageerror(s) on /progress before scroll:\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay attached before scroll on progress screen",
    ).not.toBeAttached();

    // Scroll the inner React Native container (not the document).
    // The progress screen uses a ScrollableTabs + segment composition;
    // try the scrollable tabs container first, fall back to the screen root.
    const container = page.getByTestId("progress-screen-container");
    await container.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(300);

    // Crash guard: post-scroll — the BLD-2074/2078 crash manifested specifically
    // at this viewport width after the component tree fully rendered.
    expect(
      pageErrors,
      `pageerror(s) on /progress after scroll — crash guard tripped (Refs: BLD-2074, BLD-2078):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);
    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay appeared after scroll on progress screen (Refs: BLD-2074, BLD-2078)",
    ).not.toBeAttached();

    const viewport = testInfo.project.name;
    await captureWithCvd({
      page,
      outDir: OUT_DIR,
      viewport,
      meta: {
        scenario: SCENARIO,
        viewport,
        capturedAt: new Date().toISOString(),
        note: "Bottom of progress tab — regression surface for BLD-2074/BLD-2078 wide-viewport crash on store-fold7",
      },
    });
  });

  test("progress-screen-container testID is mounted and no crash overlay (BLD-2357)", async ({ page }) => {
    // Structural IA assertion + crash guard on all allowed viewports.
    // This test is the durable regression-lock: if the progress screen crashes
    // or its root container is removed, this fails immediately.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress");

    // Wait for the progress container to mount.
    await expect(page.getByTestId("progress-screen-container")).toBeVisible({
      timeout: 20_000,
    });

    // Structural assertion: container is attached (not just visible).
    await expect(
      page.getByTestId("progress-screen-container"),
      "progress-screen-container testID must be attached after page load",
    ).toBeAttached({ timeout: 5_000 });

    // Hard crash guard.
    expect(
      pageErrors,
      `pageerror(s) detected on /progress — crash guard tripped (Refs: BLD-2074, BLD-2078):\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);

    await expect(
      page.getByTestId("react-crash-overlay"),
      "React crash overlay must not be attached on progress screen (Refs: BLD-2074, BLD-2078)",
    ).not.toBeAttached({ timeout: 3_000 });
  });

  test("empty-state CTA label is rendered, opaque, and legible (BLD-2585)", async ({
    page,
  }, testInfo) => {
    // Regression lock for BLD-2581/BLD-2585: the workouts empty-state primary
    // CTA ("Start a workout") was flagged as a coral pill with no visible text.
    // Root cause was an audit-harness artifact — chromium-headless-shell in the
    // fontless agent container measures EVERY text run as 0×0 (no system fonts),
    // so the label collapsed. The app code was proven correct.
    //
    // These assertions therefore lock the two failure modes that would make the
    // pill *genuinely* blank on a real device, WITHOUT depending on the harness
    // being able to shape glyphs (so they pass in both the fontless agent
    // container AND the font-provisioned CI runner):
    //   1. the CTA element renders (pill present + visible + opaque, opacity≠0)
    //      — guards the reanimated opacity/scale race hypothesis;
    //   2. the label text node is present with a resolved color that is neither
    //      transparent nor equal to the pill background — guards color==bg.
    // Deliberately NO `boundingBox width > 0` assertion: that would be flaky in
    // the exact fontless environment that produced the original finding.
    test.skip(
      testInfo.project.name !== "mobile",
      "BLD-2585: assert on the 390×844 audit surface only",
    );

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__SKIP_ONBOARDING__ = true;
    });

    // No scenario seed → the progress screen renders its workouts empty-state.
    await page.goto("/progress");

    const emptyState = page.getByTestId("progress-workouts-empty");
    await expect(
      emptyState,
      "workouts empty-state must mount when no workouts are seeded",
    ).toBeVisible({ timeout: 20_000 });

    // Let any entry animation settle to its resting frame.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          void document.documentElement.offsetHeight;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(resolve, 300)),
          );
        }),
    );

    const cta = page.getByTestId("progress-empty-cta");
    await expect(cta, "empty-state CTA must be attached").toBeAttached({
      timeout: 5_000,
    });
    await expect(cta, "empty-state CTA must be visible").toBeVisible();

    // (1) Neither the CTA nor any ancestor may rest at opacity 0 — this is the
    // "reanimated opacity race" the ticket flagged. Walk the ancestor chain and
    // assert the multiplied opacity is non-zero.
    const effectiveOpacity = await cta.evaluate((el) => {
      let o = 1;
      let cur: Element | null = el;
      while (cur) {
        const v = parseFloat(getComputedStyle(cur).opacity || "1");
        if (!Number.isNaN(v)) o *= v;
        cur = cur.parentElement;
      }
      return o;
    });
    expect(
      effectiveOpacity,
      "CTA effective (cumulative) opacity must be > 0 — a resting opacity of 0 is the invisible-text failure mode",
    ).toBeGreaterThan(0);

    // (2) The label text node must exist with a legible color: present, not
    // transparent, and not equal to the pill's own background color.
    const label = page.getByText("Start a workout", { exact: true });
    await expect(
      label,
      "CTA label text node must be present in the DOM",
    ).toBeAttached({ timeout: 5_000 });

    const colorInfo = await label.first().evaluate((el) => {
      const cs = getComputedStyle(el as Element);
      // nearest ancestor with a non-transparent background = the pill
      let bg = "rgba(0, 0, 0, 0)";
      let cur: Element | null = el.parentElement;
      while (cur) {
        const b = getComputedStyle(cur).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") {
          bg = b;
          break;
        }
        cur = cur.parentElement;
      }
      return { color: cs.color, opacity: cs.opacity, bg };
    });

    expect(colorInfo.color, "label color must be set").toBeTruthy();
    expect(
      colorInfo.color.replace(/\s/g, ""),
      "label color must not be fully transparent",
    ).not.toBe("rgba(0,0,0,0)");
    expect(colorInfo.opacity, "label's own opacity must not be 0").not.toBe(
      "0",
    );
    expect(
      colorInfo.color.replace(/\s/g, ""),
      "label color must differ from the pill background (else it is invisible)",
    ).not.toBe(colorInfo.bg.replace(/\s/g, ""));

    // Crash guard parity with the rest of this spec.
    expect(
      pageErrors,
      `pageerror(s) detected on /progress empty-state:\n${pageErrors.join("\n")}`,
    ).toHaveLength(0);
  });

  test("empty-state headline + CTA label render with non-zero width (BLD-2585 / BLD-2586)", async ({ page }, testInfo) => {
    // AC4 (BLD-2586): strengthen the BLD-2585 empty-state assertion from
    // "text is attached" to "text has visible width". This is the durable
    // guard that catches the fontless-container 0x0 defect: without a text
    // font, react-native-web measures every glyph run as 0x0, the empty-state
    // headline + CTA label collapse to width 0, and the audit emits a false
    // "missing label" finding (BLD-2581 / BLD-2582 / BLD-2585). With a font
    // present — real OS fonts on CI/desktop, or the E2E-only injected Roboto
    // in the fontless agent container (scripts/inject-audit-fonts.mjs) — both
    // texts measure > 0. Scoped to the mobile 390×844 viewport named in the
    // BLD-2586 acceptance criteria.
    test.skip(
      testInfo.project.name !== "mobile",
      "BLD-2586 AC4: assert on the mobile 390×844 viewport",
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress");

    // The default "workouts" segment renders WorkoutEmptyState when there is
    // no seeded workout data (this spec seeds none) — see WorkoutSegment.tsx.
    const emptyState = page.getByTestId("progress-workouts-empty");
    await expect(emptyState).toBeVisible({ timeout: 20_000 });

    // Ensure a frame is committed and web fonts have settled before measuring.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const finish = () =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve()),
            );
          // document.fonts.ready resolves once the injected FontFace loader
          // (or the OS fonts) are available; guard for environments without
          // the FontFaceSet API at all.
          const fontSet = (document as Document).fonts;
          if (fontSet) {
            void fontSet.ready.then(finish);
          } else {
            finish();
          }
        }),
    );

    const headline = emptyState.getByText("Track your progress");
    const ctaLabel = emptyState.getByText("Start a workout");

    await expect(headline).toBeVisible();
    await expect(ctaLabel).toBeVisible();

    const headlineBox = await headline.boundingBox();
    const ctaBox = await ctaLabel.boundingBox();

    expect(
      headlineBox?.width ?? 0,
      "empty-state headline 'Track your progress' has zero width — text did not render " +
        "(fontless-render regression; Refs: BLD-2586, BLD-2585)",
    ).toBeGreaterThan(0);

    expect(
      ctaBox?.width ?? 0,
      "empty-state CTA label 'Start a workout' has zero width — button label did not render " +
        "(fontless-render regression; Refs: BLD-2586, BLD-2585, BLD-2581)",
    ).toBeGreaterThan(0);
  });
});
