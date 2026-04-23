/**
 * Dev-only visual-regression harness for SessionHeaderToolbar's adaptive chip.
 *
 * Renders SessionHeaderToolbar with `rest`, `breakdown`, and viewport values
 * seeded from `window.__REST_TOOLBAR_SEED__`. Also writes app_settings entries
 * (`rest_show_breakdown`, `rest_after_warmup_enabled`, `rest_adaptive_enabled`)
 * BEFORE mounting the toolbar so its `useEffect` that reads
 * `rest_show_breakdown` observes the seeded value on first paint (see
 * `components/session/SessionHeaderToolbar.tsx:125-131`).
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
 * Refs: BLD-535.
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
        // Prime app_settings BEFORE rendering the toolbar — its on-mount
        // effect reads `rest_show_breakdown` exactly once and never again.
        const kv = s.settings ?? {};
        const writes: Array<Promise<unknown>> = [];
        if (kv.rest_show_breakdown !== undefined) {
          writes.push(setAppSetting("rest_show_breakdown", kv.rest_show_breakdown));
        }
        if (kv.rest_after_warmup_enabled !== undefined) {
          writes.push(
            setAppSetting("rest_after_warmup_enabled", kv.rest_after_warmup_enabled),
          );
        }
        if (kv.rest_adaptive_enabled !== undefined) {
          writes.push(setAppSetting("rest_adaptive_enabled", kv.rest_adaptive_enabled));
        }
        await Promise.all(writes);
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

  return (
    <View>
      <SessionHeaderToolbar
        rest={seed.rest}
        elapsed={seed.elapsed ?? 0}
        estimatedDuration={seed.estimatedDuration ?? null}
        breakdown={seed.breakdown}
        onStartRest={() => {}}
        onDismissRest={() => {}}
        onOpenToolbox={() => {}}
      />
    </View>
  );
}
