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
 * a fresh psychologist review.
 */
import { useCallback, useEffect } from "react";
import * as Haptics from "expo-haptics";
import {
  getAppSetting,
  setAppSetting,
} from "@/lib/db";
import {
  play as playAudio,
  setEnabled as setAudioEnabled,
} from "@/lib/audio";

const KEY_HAPTIC = "feedback.setComplete.haptic";
const KEY_AUDIO = "feedback.setComplete.audio";

// Module-scalar cache so fire() is fully synchronous. Defaults match the
// plan: haptic ON, audio OFF. Settings writes update both SQLite and this
// cache via setSetCompletionHaptic / setSetCompletionAudio.
let hapticEnabled = true;
let audioEnabled = false;
let hydrated = false;
let hydrating: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const [h, a] = await Promise.all([
        getAppSetting(KEY_HAPTIC),
        getAppSetting(KEY_AUDIO),
      ]);
      // Race guard: if an explicit setter ran while we were awaiting,
      // the explicit value wins. `hydrated` flips to true in that case.
      if (hydrated) return;
      hapticEnabled = h !== "false"; // default true on missing
      audioEnabled = a === "true";   // default false on missing
      // Mirror into the audio module's "feedback" category so play()
      // respects the same toggle without an extra branch in fire().
      setAudioEnabled("feedback", audioEnabled);
      hydrated = true;
    } catch {
      // Defaults already applied; swallow so the session screen never
      // fails to render due to SQLite hiccup.
      hydrated = true;
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

export async function setSetCompletionHaptic(val: boolean): Promise<void> {
  hapticEnabled = val;
  // Mark hydrated so any in-flight hydrate() does not overwrite the
  // explicit user choice with the stored (or default) value.
  hydrated = true;
  // Rethrow SQLite write failures so the caller (PreferencesCard) can
  // surface a toast. Cache/runtime state is already updated above.
  await setAppSetting(KEY_HAPTIC, val ? "true" : "false");
}

export async function setSetCompletionAudio(val: boolean): Promise<void> {
  audioEnabled = val;
  hydrated = true;
  // Mirror into the audio module's per-category gate so play() short-
  // circuits before touching expo-audio when the user turned it off.
  setAudioEnabled("feedback", val);
  // Rethrow SQLite write failures so the caller can surface a toast.
  await setAppSetting(KEY_AUDIO, val ? "true" : "false");
}

export function getSetCompletionHaptic(): boolean { return hapticEnabled; }
export function getSetCompletionAudio(): boolean { return audioEnabled; }

/** Test-only: reset module cache between tests. */
export function __resetSetCompletionFeedbackForTests(): void {
  hapticEnabled = true;
  audioEnabled = false;
  hydrated = false;
  hydrating = null;
}

/**
 * React hook — returns a stable `fire()` callback that must be called
 * synchronously on the false → true checkbox transition. Un-complete
 * transitions MUST NOT call fire().
 */
export function useSetCompletionFeedback(): { fire: () => void } {
  useEffect(() => {
    // Kick off async hydrate on mount. First tap before this resolves
    // still fires with the defaults (haptic on, audio off) so there is
    // never a missed haptic on the very first set of the session.
    void hydrate();
  }, []);

  const fire = useCallback(() => {
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
