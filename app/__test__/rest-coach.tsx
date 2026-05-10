/**
 * Dev-only visual-regression harness for ReminderSection's Smart Rest Coach rows.
 *
 * Renders the three BLD-1137 settings rows (pre-end cue, live countdown, show next set)
 * with state seeded from `window.__REST_COACH_HARNESS__`.
 *
 * Guards:
 *   1. `__DEV__ === true`
 *   2. `Platform.OS === "web"`
 *   3. `typeof window !== "undefined" && window.__REST_COACH_HARNESS__ != null`
 *
 * Bundle hygiene: ALL references to `__REST_COACH_HARNESS__` are inside the
 * `if (__DEV__)` branch in `useEffect`. Metro folds `__DEV__` to `false` in
 * production builds and tree-shakes the entire branch. Verified by
 * `scripts/verify-scenario-hook-not-in-bundle.sh`.
 *
 * Refs: BLD-1137. Precedent: BLD-535/537, BLD-1123.
 */
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import ReminderSection from "@/components/settings/ReminderSection";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useToast } from "@/components/ui/bna-toast";

type HarnessSeed = {
  restNotifications?: boolean;
  restPreEndCueSeconds?: number;
  restLiveCountdown?: boolean;
  restShowNextSet?: boolean;
  permDenied?: boolean;
  harnessActive?: boolean;
};

type HarnessState = {
  harnessActive: boolean;
  restNotifications: boolean;
  restPreEndCueSeconds: number;
  restLiveCountdown: boolean;
  restShowNextSet: boolean;
  permDenied: boolean;
};

export default function RestCoachHarness() {
  const colors = useThemeColors();
  const toast = useToast();
  const [state, setState] = useState<HarnessState | null>(null);

  useEffect(() => {
    if (__DEV__) {
      if (Platform.OS !== "web") return;
      if (typeof window === "undefined") return;

      const w = window as unknown as Record<string, unknown>;
      const seed = w["__REST_COACH_HARNESS__"] as HarnessSeed | undefined;
      if (!seed?.harnessActive) return;

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        harnessActive: true,
        restNotifications: seed.restNotifications ?? true,
        restPreEndCueSeconds: seed.restPreEndCueSeconds ?? 10,
        restLiveCountdown: seed.restLiveCountdown ?? true,
        restShowNextSet: seed.restShowNextSet ?? false,
        permDenied: seed.permDenied ?? false,
      });

      if (typeof document !== "undefined" && document.body) {
        document.body.dataset.testReady = "true";
      }
    }
  }, []);

  if (!__DEV__) return null;
  if (Platform.OS !== "web") return null;
  if (!state?.harnessActive) return null;

  return (
    <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }} testID="rest-coach-harness">
      <ReminderSection
        colors={colors}
        toast={toast}
        reminders={false}
        setReminders={() => {}}
        reminderTime="08:00"
        setReminderTime={() => {}}
        permDenied={state.permDenied}
        setPermDenied={(v) => setState((s) => s ? { ...s, permDenied: v } : s)}
        scheduleCount={0}
        restNotifications={state.restNotifications}
        setRestNotifications={(v) => setState((s) => s ? { ...s, restNotifications: v } : s)}
        restPreEndCueSeconds={state.restPreEndCueSeconds}
        setRestPreEndCueSeconds={(v) => setState((s) => s ? { ...s, restPreEndCueSeconds: v } : s)}
        restLiveCountdown={state.restLiveCountdown}
        setRestLiveCountdown={(v) => setState((s) => s ? { ...s, restLiveCountdown: v } : s)}
        restShowNextSet={state.restShowNextSet}
        setRestShowNextSet={(v) => setState((s) => s ? { ...s, restShowNextSet: v } : s)}
      />
    </View>
  );
}
