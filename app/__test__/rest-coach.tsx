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
 * Bundle hygiene: `__REST_COACH_HARNESS__` only referenced inside `if (__DEV__)` branch.
 * Verified by `scripts/verify-scenario-hook-not-in-bundle.sh`.
 *
 * Refs: BLD-1137. Precedent: BLD-535/537, BLD-1123.
 */
import { Platform, View } from "react-native";
import { useState } from "react";
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

declare global {
  interface Window {
    __REST_COACH_HARNESS__?: HarnessSeed;
  }
}

export default function RestCoachHarness() {
  const colors = useThemeColors();
  const toast = useToast();
  const [harnessActive] = useState(() => {
    if (!__DEV__ || Platform.OS !== "web" || typeof window === "undefined") return false;
    return window.__REST_COACH_HARNESS__?.harnessActive ?? false;
  });
  const [restNotifications, setRestNotifications] = useState(() =>
    window.__REST_COACH_HARNESS__?.restNotifications ?? true
  );
  const [restPreEndCueSeconds, setRestPreEndCueSeconds] = useState(() =>
    window.__REST_COACH_HARNESS__?.restPreEndCueSeconds ?? 10
  );
  const [restLiveCountdown, setRestLiveCountdown] = useState(() =>
    window.__REST_COACH_HARNESS__?.restLiveCountdown ?? true
  );
  const [restShowNextSet, setRestShowNextSet] = useState(() =>
    window.__REST_COACH_HARNESS__?.restShowNextSet ?? false
  );
  const [permDenied, setPermDenied] = useState(() =>
    window.__REST_COACH_HARNESS__?.permDenied ?? false
  );

  if (!__DEV__ || Platform.OS !== "web" || !harnessActive) return null;

  return (
    <View style={{ padding: 16, backgroundColor: colors.background, flex: 1 }} testID="rest-coach-harness">
      <ReminderSection
        colors={colors}
        toast={toast}
        reminders={false}
        setReminders={() => {}}
        reminderTime="08:00"
        setReminderTime={() => {}}
        permDenied={permDenied}
        setPermDenied={setPermDenied}
        scheduleCount={0}
        restNotifications={restNotifications}
        setRestNotifications={setRestNotifications}
        restPreEndCueSeconds={restPreEndCueSeconds}
        setRestPreEndCueSeconds={setRestPreEndCueSeconds}
        restLiveCountdown={restLiveCountdown}
        setRestLiveCountdown={setRestLiveCountdown}
        restShowNextSet={restShowNextSet}
        setRestShowNextSet={setRestShowNextSet}
      />
    </View>
  );
}
