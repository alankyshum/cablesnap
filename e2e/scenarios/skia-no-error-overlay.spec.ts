/**
 * Scenario spec: skia-no-error-overlay (BLD-2125 regression guard).
 *
 * Locks the root-cause fix: on the static `--dev` web bundle, `LoadSkiaWeb()`
 * must locate the root-staged `/canvaskit.wasm` (via `canvaskitLocateFile`) so
 * CanvasKit initialises WITHOUT throwing an uncaught `pageerror`. Before the
 * fix, CanvasKit fetched a non-existent `/_expo/static/js/web/canvaskit.wasm`,
 * received the SPA `index.html` fallback, aborted with
 * `WebAssembly.instantiate(): expected magic word …`, and the Expo LogBox
 * mounted `#error-overlay` on EVERY web route — intercepting all pointer events
 * and breaking form-clip-compare / session-pacing / stack-marker.
 *
 * This guard is intentionally route-agnostic: the overlay was global (the Skia
 * init runs in the root `app/_layout.tsx`), so a single representative harness
 * route is sufficient to detect a regression. We assert:
 *   1. No `#error-overlay` host ever mounts.
 *   2. No uncaught `pageerror` mentioning the WASM magic-word / CanvasKit abort.
 *
 * Refs: BLD-2125. Reproduction recipe matches scripts/daily-audit.sh
 * (expo export -p web --dev + E2E_USE_STATIC=1 playwright … --project=mobile).
 */
import { test, expect } from "@playwright/test";

const SAMPLE_PACING = {
  working: 1122,
  rest: 2470,
  other: 428,
  gross: 4020,
  isEmpty: false,
  perExercise: [{ exercise_id: "ex1", working: 252, rest: 585, other: 150 }],
};

test.describe("@scenario skia-no-error-overlay", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixtures arg
  test.beforeAll(({}, testInfo) => {
    test.skip(
      !["mobile"].includes(testInfo.project.name),
      "skia-no-error-overlay: mobile viewport only",
    );
  });

  test("no LogBox error-overlay / CanvasKit WASM pageerror on web routes (BLD-2125)", async ({
    page,
  }) => {
    const wasmAbortErrors: string[] = [];
    page.on("pageerror", (err) => {
      const msg = `${err.name}: ${err.message}`;
      if (
        msg.includes("expected magic word") ||
        msg.includes("WebAssembly.instantiate") ||
        msg.toLowerCase().includes("canvaskit") ||
        msg.includes("Aborted(")
      ) {
        wasmAbortErrors.push(msg);
      }
    });

    // Any harness route mounts the root layout (and thus useSkiaWebInit).
    await page.addInitScript((pacing) => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__SESSION_PACING_HARNESS__ = {
        harnessActive: true,
        pacing,
        exerciseNames: { ex1: "Cable Row" },
      };
    }, SAMPLE_PACING);

    await page.goto("/__test__/session-pacing");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // Give the Skia init retry/poll loop time to run and (pre-fix) throw.
    await page.waitForTimeout(2000);

    // 1. The blocking LogBox overlay must never mount.
    await expect(page.locator("#error-overlay")).toHaveCount(0);

    // 2. No uncaught CanvasKit/WASM abort escaped LoadSkiaWeb().
    expect(
      wasmAbortErrors,
      "CanvasKit WASM failed to load — locateFile likely not pointing at the " +
        "root-staged /canvaskit.wasm (see hooks/canvaskitLocateFile.ts).",
    ).toHaveLength(0);

    // 3. Sanity: the seeded card is interactable (overlay would block this).
    const cardBody = page.getByRole("button", { name: /Estimated pacing/i });
    await expect(cardBody).toBeVisible({ timeout: 5000 });
    await cardBody.click();
    await expect(page.getByText("Pacing by exercise")).toBeVisible({
      timeout: 5000,
    });
  });
});
