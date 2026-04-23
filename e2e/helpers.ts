import { type Page, type TestInfo, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// react-native-web may render icon fonts as role="img" divs without alt text.
// These are upstream library issues we can't fix in app code.
const KNOWN_LIBRARY_RULES = ["role-img-alt", "nested-interactive"];

/**
 * Skip onboarding by setting a window flag before page load.
 * The app's root layout checks `window.__SKIP_ONBOARDING__` on web
 * and bypasses the onboarding check when it's set.
 *
 * Must be called once per page context (typically in test.beforeEach).
 */
export async function skipOnboarding(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__SKIP_ONBOARDING__ = true;
  });
  await page.goto("/");
  await page.waitForTimeout(500);
}

/**
 * Navigate to a route. The __SKIP_ONBOARDING__ init script persists
 * across navigations within the same page context, so each goto()
 * automatically bypasses onboarding.
 */
export async function navigateTo(page: Page, path: string) {
  if (path === "/" || path === "") return;
  await page.goto(path);
  await page.waitForTimeout(800);
}

/**
 * Minimal shape of an exercise row used by the exercises fixture escape hatch.
 * We deliberately keep this as a loose type rather than importing
 * `lib/types.ts` — Playwright specs run in a browser context via
 * `addInitScript` where the app module graph isn't available.
 */
export type E2EExerciseFixture = {
  id: string;
  name: string;
  category: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string;
  instructions: string;
  difficulty: string;
  is_custom: boolean;
};

/**
 * Inject a deterministic exercises fixture that `lib/db/exercises.ts` will
 * honor in place of the real SQLite query (BLD-526). The app-side check is
 * guarded by `navigator.webdriver === true`, which Playwright sets
 * automatically — a console-injected flag in a real user's browser will not
 * swap their data.
 *
 * Call once per page context, BEFORE the first `goto()` (addInitScript only
 * applies to subsequent navigations).
 */
export async function enableExerciseFixture(
  page: Page,
  fixture: E2EExerciseFixture[]
) {
  await page.addInitScript((rows) => {
    (window as unknown as Record<string, unknown>).__E2E_EXERCISE_FIXTURE__ =
      rows;
  }, fixture);
}

/**
 * Run axe-core and assert zero critical accessibility violations.
 * Serious violations are attached as annotations (warnings) to the test.
 * Critical violations cause a hard failure.
 */
export async function assertAccessible(page: Page, testInfo?: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .disableRules(KNOWN_LIBRARY_RULES)
    .analyze();

  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");

  if (serious.length > 0 && testInfo) {
    const summary = serious.map(
      (v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`
    );
    testInfo.annotations.push({
      type: "a11y-warning",
      description: summary.join("; "),
    });
  }

  if (critical.length > 0) {
    const summary = critical.map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n  ${v.nodes.map((n) => n.html).join("\n  ")}`
    );
    expect(
      critical,
      `Critical accessibility violations:\n${summary.join("\n\n")}`
    ).toHaveLength(0);
  }

  return results;
}
