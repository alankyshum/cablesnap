/**
 * Set-completion confirmation feedback (BLD-559).
 *
 * SINGLE-SITE INVARIANT: `fire()` is the sole source of the Medium haptic
 * and `set_complete` audio cue on a false → true set-complete transition.
 * `hooks/usePRCelebration.ts` intentionally does NOT fire a haptic or audio
 * on PR detection — the perceptual event is "tap", not "PR detected", and
 * stacking two haptics on PR sets is a Dealer-drift vector per the plan's
 * anti-Dealer guardrails.
 *
 * See: /projects/cablesnap/.plans/PLAN-BLD-559.md (APPROVED R2).
 *
 * Adding a haptic or audio call elsewhere in the completion flow requires
 * a psychologist review.
 */
import { useCallback, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { emitSetCompleted } from "@/lib/workout/tempo-coach";
import {
  setAppSetting,
} from "@/lib/db";
import {
  play as playAudio,
  setEnabled as setAudioEnabled,
} from "@/lib/audio";

const KEY_HAPTIC = "feedback.setComplete.haptic";
const KEY_AUDIO = "feedback.setComplete.audio";

// Module-scalar cache. Both forced ON now.
let hapticEnabled = true;
let audioEnabled = true;

export async function setSetCompletionHaptic(val: boolean): Promise<void> {
  hapticEnabled = val;
  // Rethrow SQLite write failures.
  await setAppSetting(KEY_HAPTIC, val ? "true" : "false");
}

export async function setSetCompletionAudio(val: boolean): Promise<void> {
  audioEnabled = val;
  // Mirror into the audio module's per-category gate so play() short-
  // circuits before touching expo-audio when the user turned it off.
  setAudioEnabled("feedback", val);
  // Rethrow SQLite write failures.
  await setAppSetting(KEY_AUDIO, val ? "true" : "false");
}

export function getSetCompletionHaptic(): boolean { return hapticEnabled; }
export function getSetCompletionAudio(): boolean { return audioEnabled; }

/** Test-only: reset module cache between tests. */
export function __resetSetCompletionFeedbackForTests(): void {
  hapticEnabled = true;
  audioEnabled = true;
}

/**
 * React hook — returns a stable `fire()` callback that must be called
 * synchronously on the false → true checkbox transition. Un-complete
 * transitions MUST NOT call fire().
 */
export function useSetCompletionFeedback(): { fire: () => void } {
  useEffect(() => {
    // call setAudioEnabled("feedback", true) once on mount so the audio category is enabled
    setAudioEnabled("feedback", true);
  }, []);

  const fire = useCallback(() => {
    emitSetCompleted();
    if (hapticEnabled) {
      // Fire-and-forget — do not await. expo-haptics no-ops on devices
      // without haptic hardware per its contract.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (audioEnabled) {
      // play() is internally async but we deliberately do not await so
      // the synchronous call-site (SetRow onPress) returns immediately.
      void playAudio("set_complete");
    }
  }, []);

  return { fire };
}
