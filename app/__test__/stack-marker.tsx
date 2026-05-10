/**
 * Dev-only visual-regression harness for StackMarkerPill (BLD-1126).
 *
 * Renders StackMarkerPill in isolation with state seeded from
 * `window.__STACK_MARKER_HARNESS__`. The harness starts with a pristine
 * row (weight=null, stack_marker=null → shows "Pick marker"), then on tap
 * advances to the marker-logged state from the seed (shows "<marker> · <weight> <unit>").
 * This exercises the three-state pill render contract (AC1) and the tap→commit
 * flow (AC3) without needing a live MarkerPickerSheet in web Playwright.
 *
 * Guards (all three must hold — any false => component renders `null`):
 *   1. `__DEV__ === true`                                    (not a prod build)
 *   2. `Platform.OS === "web"`                               (native targets never mount)
 *   3. `typeof window !== "undefined" && window.__STACK_MARKER_HARNESS__ != null`
 *
 * Bundle hygiene: the only runtime reference to `__STACK_MARKER_HARNESS__`
 * is inside an `if (__DEV__)` branch. Metro folds `__DEV__` to `false` in
 * production builds and strips the branch, so the string does not appear in
 * the prod web bundle. Enforced by `scripts/verify-scenario-hook-not-in-bundle.sh`.
 *
 * Refs: BLD-1126, BLD-1127.
 */
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { StackMarkerPill } from "@/components/session/StackMarkerPill";

/** Typed seed contract for this harness. Must stay in sync with the spec. */
export type StackMarkerHarnessSeed = {
  /** The marker that gets committed when the pristine pill is tapped. */
  markerResult: {
    marker: number;
    weight: number;
    unit: string;
  };
};

export default function StackMarkerHarness() {
  const [seed, setSeed] = useState<StackMarkerHarnessSeed | null>(null);
  // Tracks the committed marker (null = pristine, non-null = marker-logged).
  const [confirmedMarker, setConfirmedMarker] = useState<number | null>(null);
  const [confirmedWeight, setConfirmedWeight] = useState<number | null>(null);
  const [confirmedUnit, setConfirmedUnit] = useState<string>("kg");

  useEffect(() => {
    if (__DEV__) {
      if (Platform.OS !== "web") return;
      if (typeof window === "undefined") return;

      const w = window as unknown as Record<string, unknown>;
      const s = w["__STACK_MARKER_HARNESS__"] as StackMarkerHarnessSeed | undefined;
      if (!s) return;

      let cancelled = false;
      (async () => {
        await Promise.resolve();
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Simulate the MarkerPickerSheet.onConfirm callback: set state to marker-logged.
  const handlePress = () => {
    if (confirmedMarker !== null) return; // already committed — re-tap is a no-op in this harness
    setConfirmedMarker(seed.markerResult.marker);
    setConfirmedWeight(seed.markerResult.weight);
    setConfirmedUnit(seed.markerResult.unit);
    if (typeof document !== "undefined" && document.body) {
      document.body.dataset.confirmedMarker = String(seed.markerResult.marker);
    }
  };

  return (
    <View style={{ padding: 16 }}>
      <StackMarkerPill
        marker={confirmedMarker}
        weight={confirmedWeight}
        unit={confirmedUnit}
        setNumber={1}
        onPress={handlePress}
        onLongPress={() => {}}
      />
    </View>
  );
}
