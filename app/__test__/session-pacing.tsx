/**
 * Dev-only visual-regression harness for PacingCard (BLD-1144).
 *
 * Renders PacingCard with pacing data seeded from `window.__SESSION_PACING_HARNESS__`.
 *
 * Guards:
 *   1. `__DEV__ === true`
 *   2. `Platform.OS === "web"`
 *   3. `typeof window !== "undefined" && window.__SESSION_PACING_HARNESS__ != null`
 *
 * Bundle hygiene: ALL references to `__SESSION_PACING_HARNESS__` are inside the
 * `if (__DEV__)` branch in `useEffect`. Metro folds `__DEV__` to `false` in
 * production builds and tree-shakes the entire branch.
 *
 * Refs: BLD-1144. Precedent: BLD-1137 (rest-coach.tsx).
 */
import { useEffect, useState } from "react";
import { Platform, ScrollView } from "react-native";
import PacingCard from "@/components/session/summary/PacingCard";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { PacingBreakdown } from "@/lib/session-pacing";

type HarnessSeed = {
  harnessActive?: boolean;
  pacing?: PacingBreakdown;
  exerciseNames?: Record<string, string>;
};

export default function SessionPacingHarness() {
  const colors = useThemeColors();
  const [seed, setSeed] = useState<HarnessSeed | null>(null);

  useEffect(() => {
    if (__DEV__) {
      if (Platform.OS !== "web") return;
      if (typeof window === "undefined") return;

      const w = window as unknown as Record<string, unknown>;
      const s = w["__SESSION_PACING_HARNESS__"] as HarnessSeed | undefined;
      if (!s?.harnessActive) return;

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeed(s);

      if (typeof document !== "undefined" && document.body) {
        document.body.dataset.testReady = "true";
      }
    }
  }, []);

  if (!__DEV__) return null;
  if (Platform.OS !== "web") return null;
  if (!seed?.harnessActive || !seed.pacing) return null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={{ padding: 16 }}
      testID="session-pacing-harness"
    >
      <PacingCard
        pacing={seed.pacing}
        exerciseNames={seed.exerciseNames ?? {}}
      />
    </ScrollView>
  );
}
