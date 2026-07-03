import type { MutableRefObject } from "react";
import {
  withTiming,
  withSequence,
  withDelay,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { play as playAudio } from "../lib/audio";
import { getAppSetting } from "../lib/db";

/**
 * Fire the rest-complete haptic buzz pattern + completion sound on timer end,
 * gated on the user's rest_timer_vibrate / rest_timer_sound settings. Any
 * scheduled haptic timeouts are stored in hapticTimersRef so the caller can
 * clear them on unmount.
 */
export function fireRestCompleteFeedback(
  hapticTimersRef: MutableRefObject<ReturnType<typeof setTimeout>[]>,
): void {
  void Promise.all([
    getAppSetting("rest_timer_vibrate"),
    getAppSetting("rest_timer_sound"),
  ]).then(([vibrateSetting, soundSetting]) => {
    if (vibrateSetting !== "false") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const t1 = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 300);
      const t2 = setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }, 600);
      hapticTimersRef.current = [t1, t2];
    }
    if (soundSetting !== "false") {
      playAudio("complete");
    }
  });
}

/** Play the countdown tick sound (last 3s) unless rest sounds are muted. */
export function playRestTickSound(): void {
  void getAppSetting("rest_timer_sound").then((soundSetting) => {
    if (soundSetting !== "false") playAudio("tick");
  });
}

/**
 * BLD-611: one-shot start-flash on rest start (0 → positive). Single attention
 * pulse on the timer chip. Honors OS Reduce Motion via a static tint hold (no
 * opacity flicker, no cycles). Constraints: total ≤ 700 ms, single cycle
 * ≥ 300 ms, accent palette only. WCAG 2.3.1 (no strobe).
 */
export function runRestStartFlash(restFlash: SharedValue<number>, reduceMotion: boolean): void {
  if (reduceMotion) {
    // Static tint hold: brief fade-in to peak, hold ~200 ms, fade back.
    restFlash.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(200, withTiming(0, { duration: 100 })),
    );
  } else {
    // Single pulse: rise to peak, return to baseline. ~650 ms total, one cycle.
    restFlash.value = withSequence(
      withTiming(1, { duration: 300 }),
      withTiming(0, { duration: 350 }),
    );
  }
}
