/**
 * Dev-only visual-regression harness for SessionHeaderToolbar's adaptive chip.
 *
 * Renders SessionHeaderToolbar with `rest`, `breakdown`, and viewport values
 * seeded from `window.__REST_TOOLBAR_SEED__`.
 *
 * Chip visibility (`rest_show_breakdown`) is passed DIRECTLY to the toolbar
 * via the `showBreakdownChip` prop — we no longer round-trip through the
 * app_settings DB. This eliminates the first-paint race where the toolbar
 * would render with `showBreakdownChip=true` while its on-mount async
 * `getAppSetting("rest_show_breakdown")` was still inflight (BLD-537).
 *
 * `rest_after_warmup_enabled` / `rest_adaptive_enabled` are still written to
 * the DB: those are consumed by `lib/rest.ts` resolveRestSeconds (pre-mount,
 * pure function on the seed's `breakdown` object), not by an on-mount effect.
 *
 * Guards (all three must hold — any false => harness renders `null`):
 *   1. `__DEV__ === true`                                    (not a prod build)
 *   2. `Platform.OS === "web"`                               (native targets never mount)
 *   3. `typeof window !== "undefined" && window.__REST_TOOLBAR_SEED__ != null`
 *
 * Bundle hygiene: the only runtime reference to the string
 * `__REST_TOOLBAR_SEED__` is inside an `if (__DEV__)` branch. Metro folds
 * `__DEV__` to `false` in production builds and strips the branch, so the
 * string does not appear in the prod web bundle. Verified by
 * `scripts/verify-scenario-hook-not-in-bundle.sh`.
 *
 * Refs: BLD-535, BLD-537.
 */
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { SessionHeaderToolbar } from "@/components/session/SessionHeaderToolbar";
import { setAppSetting } from "@/lib/db";
import type { RestBreakdown } from "@/lib/rest";

type Seed = {
  rest: number;
  breakdown: RestBreakdown;
  elapsed?: number;
  estimatedDuration?: number | null;
  settings?: {
    rest_show_breakdown?: "true" | "false";
    rest_after_warmup_enabled?: "true" | "false";
    rest_adaptive_enabled?: "true" | "false";
  };
};

export default function RestToolbarHarness() {
  const [seed, setSeed] = useState<Seed | null>(null);

  useEffect(() => {
    // Entire body is wrapped in `if (__DEV__)` so Metro constant-folds the
    // branch away in production builds, removing the `__REST_TOOLBAR_SEED__`
    // string literal and the setAppSetting calls. This matches the pattern
    // in `hooks/useAppInit.ts:29` (test-seed) that the bundle-gate verifies.
    if (__DEV__) {
      if (Platform.OS !== "web") return;
      if (typeof window === "undefined") return;

      const w = window as unknown as Record<string, unknown>;
      const s = w["__REST_TOOLBAR_SEED__"] as Seed | undefined;
      if (!s) return;

      let cancelled = false;
      (async () => {
        // Prime DB settings that other code paths read pre-mount. Chip
        // visibility is handled via prop (see return block below) — no DB
        // round-trip needed for that (BLD-537).
        const kv = s.settings ?? {};
        const writes: Array<Promise<unknown>> = [];
        if (kv.rest_after_warmup_enabled !== undefined) {
          writes.push(
            setAppSetting("rest_after_warmup_enabled", kv.rest_after_warmup_enabled),
          );
        }
        if (kv.rest_adaptive_enabled !== undefined) {
          writes.push(setAppSetting("rest_adaptive_enabled", kv.rest_adaptive_enabled));
        }
        try {
          await Promise.all(writes);
        } catch (err) {
          // Never swallow failure silently — expose via data attr so Playwright
          // surfaces it in error-context, then still flip testReady so the gate
          // releases and the spec can record the rendered state.
          if (typeof document !== "undefined" && document.body) {
            document.body.dataset.testSeedError =
              err instanceof Error ? err.message : String(err);
          }
        }
        if (cancelled) return;
        setSeed(s);
        if (typeof document !== "undefined" && document.body) {
          document.body.dataset.testReady = "true";
        }
      })();

      return () => {
        cancelled = true;
      };
    }
  }, []);

  if (!__DEV__) return null;
  if (Platform.OS !== "web") return null;
  if (!seed) return null;

  // Resolve chip visibility synchronously from the seed. Default: true (chip
  // shown) — matches the production default when `rest_show_breakdown` is
  // unset. Only the literal string "false" hides the chip, matching
  // `SessionHeaderToolbar`'s `v !== "false"` convention.
  const showBreakdownChip = seed.settings?.rest_show_breakdown !== "false";

  return (
    <View>
      <SessionHeaderToolbar
        rest={seed.rest}
        elapsed={seed.elapsed ?? 0}
        estimatedDuration={seed.estimatedDuration ?? null}
        breakdown={seed.breakdown}
        showBreakdownChip={showBreakdownChip}
        onStartRest={() => {}}
        onDismissRest={() => {}}
        onOpenToolbox={() => {}}
      />
    </View>
  );
}
