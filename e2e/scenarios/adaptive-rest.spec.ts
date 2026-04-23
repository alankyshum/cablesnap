/**
 * Scenario spec: adaptive-rest.
 *
 * Parametrized visual-regression spec for the Rest-Timer adaptive chip on
 * `SessionHeaderToolbar`. Navigates to a dev-only harness route that renders
 * the toolbar in isolation (see `app/__test__/rest-toolbar.tsx`) with state
 * seeded via `window.__REST_TOOLBAR_SEED__`.
 *
 * 6 states × 3 projects (mobile-narrow / mobile / mobile-large) = 18 baselines.
 *
 * The session screen below the header has live timestamps and per-set badges
 * that would flake baselines, so capture is clipped to the toolbar root
 * (`[data-testid="session-header-toolbar"]`). MM:SS / elapsed / remaining
 * text is masked because it advances between seed and screenshot.
 *
 * Gated to the three mobile Playwright projects; other projects (tablet,
 * desktop, store-*) skip — adaptive chip is a touch-only concern per
 * UX baseline spec (BLD-535).
 *
 * Refs: BLD-535, BLD-532, BLD-531, BLD-517.
 */
import { test, expect } from "@playwright/test";

type Seed = {
  rest: number;
  breakdown: {
    totalSeconds: number;
    baseSeconds: number;
    factors: Array<{ label: string; multiplier: number; deltaSeconds: number }>;
    isDefault: boolean;
    reasonShort: string;
    reasonAccessible: string;
  };
  elapsed?: number;
  estimatedDuration?: number | null;
  settings?: {
    rest_show_breakdown?: "true" | "false";
    rest_after_warmup_enabled?: "true" | "false";
    rest_adaptive_enabled?: "true" | "false";
  };
};

type StateCase = { name: string; seed: Seed };

const STATES: StateCase[] = [
  {
    // S1: default adaptive rest — 2:10, heavy + RPE 9. Verifies chip renders,
    // two-token label, left of pill.
    name: "adaptive-chip-default",
    seed: {
      rest: 130,
      breakdown: {
        totalSeconds: 130,
        baseSeconds: 90,
        factors: [
          { label: "Heavy", multiplier: 1.2, deltaSeconds: 0 },
          { label: "RPE 9", multiplier: 1.2, deltaSeconds: 0 },
        ],
        isDefault: false,
        reasonShort: "Heavy · RPE 9",
        reasonAccessible: "Heavy set, RPE 9",
      },
    },
  },
  {
    // S2: warmup — extreme-short timer, single-token chip. Verifies no overflow.
    name: "adaptive-chip-warmup",
    seed: {
      rest: 25,
      breakdown: {
        totalSeconds: 25,
        baseSeconds: 90,
        factors: [{ label: "Warmup", multiplier: 0.3, deltaSeconds: 0 }],
        isDefault: false,
        reasonShort: "Warmup",
        reasonAccessible: "Warmup set",
      },
      settings: { rest_after_warmup_enabled: "true" },
    },
  },
  {
    // S3: drop-set — min-clamp timer, chip present.
    name: "adaptive-chip-dropset",
    seed: {
      rest: 10,
      breakdown: {
        totalSeconds: 10,
        baseSeconds: 90,
        factors: [{ label: "Drop-set", multiplier: 0.1, deltaSeconds: 0 }],
        isDefault: false,
        reasonShort: "Drop-set",
        reasonAccessible: "Drop-set",
      },
    },
  },
  {
    // S4: default (all 1.0× factors → isDefault=true). Chip MUST NOT render.
    name: "adaptive-chip-hidden-default",
    seed: {
      rest: 90,
      breakdown: {
        totalSeconds: 90,
        baseSeconds: 90,
        factors: [],
        isDefault: true,
        reasonShort: "",
        reasonAccessible: "",
      },
    },
  },
  {
    // S5: user suppressed chip via setting even though adaptive resolved a
    // non-default breakdown. Chip MUST NOT render.
    name: "adaptive-chip-hidden-by-setting",
    seed: {
      rest: 130,
      breakdown: {
        totalSeconds: 130,
        baseSeconds: 90,
        factors: [
          { label: "Heavy", multiplier: 1.2, deltaSeconds: 0 },
          { label: "RPE 9", multiplier: 1.2, deltaSeconds: 0 },
        ],
        isDefault: false,
        reasonShort: "Heavy · RPE 9",
        reasonAccessible: "Heavy set, RPE 9",
      },
      settings: { rest_show_breakdown: "false" },
    },
  },
  {
    // S6: 3-token reasonShort forces the truncateChipLabel path. On 320dp
    // viewport the label truncates to "Heavy · RPE 9"; on 390/430dp the full
    // string renders. This is the only state that exercises the truncation
    // branch (v2 compound/isolation category will produce real 3-token
    // labels in the future; synth here so behavior is covered today).
    name: "adaptive-chip-truncated",
    seed: {
      rest: 130,
      breakdown: {
        totalSeconds: 130,
        baseSeconds: 90,
        factors: [
          { label: "Heavy", multiplier: 1.2, deltaSeconds: 0 },
          { label: "RPE 9", multiplier: 1.2, deltaSeconds: 0 },
          { label: "Cable", multiplier: 1.0, deltaSeconds: 0 },
        ],
        isDefault: false,
        reasonShort: "Heavy · RPE 9 · Cable",
        reasonAccessible: "Heavy set, RPE 9, cable",
      },
    },
  },
];

test.describe("@scenario adaptive-rest", () => {
  // Adaptive chip is a touch-only concern — only run on the three mobile
  // projects declared in playwright.config.ts.
  test.beforeAll((_args, testInfo) => {
    const allowed = new Set(["mobile-narrow", "mobile", "mobile-large"]);
    test.skip(
      !allowed.has(testInfo.project.name),
      "adaptive-rest: mobile viewports only (320 / 390 / 430)",
    );
  });

  for (const { name, seed } of STATES) {
    test(name, async ({ page }) => {
      // Reduce motion so reanimated flash animation is inert on capture.
      await page.emulateMedia({ reducedMotion: "reduce" });

      await page.addInitScript(
        ({ seed: s, scenario }) => {
          const w = window as unknown as Record<string, unknown>;
          w.__SKIP_ONBOARDING__ = true;
          // The scenario key is kept on window for bundle-gate traceability
          // and in case future work wants to hook the seed hook; the harness
          // itself only reads __REST_TOOLBAR_SEED__.
          w.__TEST_SCENARIO__ = scenario;
          w.__REST_TOOLBAR_SEED__ = s;
        },
        { seed, scenario: "adaptive-rest" },
      );

      await page.goto("/__test__/rest-toolbar");

      // Harness flips body[data-test-ready=true] AFTER writing settings and
      // mounting the toolbar. Gate capture on it.
      await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
        timeout: 15_000,
      });

      const toolbar = page.locator('[data-testid="session-header-toolbar"]');
      await expect(toolbar).toBeVisible({ timeout: 5_000 });

      // Capture clipped to the toolbar only; mask ticking text.
      await expect(toolbar).toHaveScreenshot(`${name}.png`, {
        maxDiffPixels: 40,
        threshold: 0.2,
        mask: [
          page.locator('[data-testid="rest-countdown-text"]'),
          page.locator('[data-testid="elapsed-time"]'),
          page.locator('[data-testid="elapsed-remaining"]'),
        ],
      });
    });
  }
});
