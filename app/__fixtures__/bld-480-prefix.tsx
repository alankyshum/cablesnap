/**
 * Dev-only harness route: BLD-480 pre-fix MusclesWorkedCard reproducer.
 *
 * Renders the post-workout summary's `MusclesWorkedCard` wrapped in the
 * regressed `maxHeight: 200` clamp, so the daily-audit's vision pipeline
 * has a fresh, deterministic capture of the BLD-480 cropping defect to
 * exercise (QD#1/QD#2 trust anchor — see `scripts/daily-audit.sh`).
 *
 * How it works:
 *   1. The scenario spec (`e2e/scenarios/completed-workout-prefix.spec.ts`)
 *      sets `window.__TEST_SCENARIO__ = "completed-workout"` via Playwright's
 *      `addInitScript`, then navigates to `/__fixtures__/bld-480-prefix`.
 *   2. `hooks/useAppInit.ts` runs `seedScenario()` on boot (web + dev only),
 *      which clears + seeds the `scenario-session-1` workout via
 *      `lib/db/test-seed.ts#seedCompletedWorkout`. Identical seed path to the
 *      production `completed-workout` scenario.
 *   3. This route reads that seeded session via `useSummaryData`, derives
 *      `primaryMuscles` / `secondaryMuscles`, and renders the buggy clamp.
 *   4. Once data has loaded the route flips
 *      `document.body.dataset.testReady = "true"` so the spec's
 *      `expect(body[data-test-ready='true']).toBeVisible()` gate releases.
 *
 * Guards (all three must hold — any false => harness renders `null`):
 *   1. `__DEV__ === true`                                    (not a prod build)
 *   2. `Platform.OS === "web"`                               (native targets never mount)
 *   3. `typeof window !== "undefined"`
 *
 * Bundle hygiene: the import of `MusclesWorkedCardPreFix` is at module top,
 * but Expo Router's web bundler tree-shakes whole route files when the
 * default export is `null`-returning under `__DEV__ === false`. The
 * `app/__test__/rest-toolbar.tsx` route follows the same pattern. The
 * `scripts/verify-scenario-hook-not-in-bundle.sh` PR-time check enforces
 * that no dev-only seed strings leak into the prod bundle.
 *
 * Refs: BLD-480 (original bug), BLD-924 / BLD-941 / BLD-943 (audit blocks
 * that motivated this), BLD-951 (this fixture).
 */
import { useEffect } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MusclesWorkedCardPreFix from "@/components/session/summary/__fixtures__/MusclesWorkedCardPreFix";
import { useSummaryData } from "@/hooks/useSummaryData";
import { useThemeColors } from "@/hooks/useThemeColors";

const SEEDED_SESSION_ID = "scenario-session-1";

export default function Bld480PrefixFixture() {
  // Production / native bail-out — these branches are constant-folded away
  // on prod web builds, matching the `app/__test__/rest-toolbar.tsx` pattern.
  if (!__DEV__) return null;
  if (Platform.OS !== "web") return null;

  return <Bld480PrefixFixtureInner />;
}

function Bld480PrefixFixtureInner() {
  const colors = useThemeColors();
  const data = useSummaryData(SEEDED_SESSION_ID);
  const { session, primaryMuscles, secondaryMuscles } = data;

  useEffect(() => {
    // Mirror `lib/db/test-seed.ts` and `app/__test__/rest-toolbar.tsx`: flip
    // `data-test-ready` once the data we need is available. Without this
    // gate the scenario spec would race the data fetch and screenshot a
    // skeleton state.
    if (typeof document === "undefined" || !document.body) return;
    if (!session) return;
    document.body.dataset.testReady = "true";
  }, [session]);

  if (!session) {
    // Render a marker so a flaky empty capture is at least diagnosable.
    return (
      <View style={styles.loading} testID="bld-480-prefix-loading">
        <Text>Seeding BLD-480 pre-fix fixture…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
      testID="bld-480-prefix-fixture"
    >
      <Text
        variant="title"
        style={{ color: colors.onSurface, marginBottom: 12, fontWeight: "700" }}
      >
        BLD-480 pre-fix reproducer
      </Text>
      <Text style={{ color: colors.onSurface, marginBottom: 16, opacity: 0.7 }}>
        Intentionally cropped via maxHeight: 200. See BLD-951.
      </Text>
      <MusclesWorkedCardPreFix
        primaryMuscles={primaryMuscles}
        secondaryMuscles={secondaryMuscles}
        colors={colors}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flexGrow: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
