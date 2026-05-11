/**
 * BLD-1158: Tempo Coach — parser/validator (PR1) + coach engine (PR2).
 *
 * PSYCHOLOGIST GUARDRAIL: This module MUST NOT contain:
 *   - streak / adherence / badge tracking
 *   - out-of-set notifications (scheduleNotificationAsync)
 *   - Persuasive copy on discouragement moments (tempo trends, plateau hints)
 * Any such addition requires a fresh psychologist review.
 */

import * as Haptics from "expo-haptics";
import * as KeepAwake from "expo-keep-awake";
import { AccessibilityInfo, AppState } from "react-native";
import { getAppSetting, setAppSetting } from "@/lib/db/settings";

export type ParsedTempo = {
  e: number; // eccentric (lowering) phase, seconds
  b: number; // bottom pause, seconds
  c: number; // concentric (lifting) phase, seconds
  t: number; // top pause, seconds
};

/**
 * Parse and validate a tempo string into its four phase components.
 *
 * Accepted formats:
 *   - Canonical:  "E-B-C-T" (e.g. "3-1-2-0", "0-60-0-0")
 *   - Compact:    "EBCT" (4 single digits, e.g. "3010" → "3-0-1-0")
 *
 * Rules (v1 locked grammar):
 *   - All phases must be integers in [0, 60].
 *   - All-zero ("0-0-0-0") is rejected — meaningless.
 *   - "X" and any non-integer characters are rejected.
 *   - Free-text is rejected.
 *
 * Returns ParsedTempo on success, null on any validation failure.
 */
export function parseTempo(input: string): ParsedTempo | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  let parts: string[];

  if (/^\d{4}$/.test(trimmed)) {
    // Compact form: "3010" → ["3","0","1","0"]
    parts = trimmed.split("");
  } else if (/^[\d]+-[\d]+-[\d]+-[\d]+$/.test(trimmed)) {
    // Canonical form: "3-1-2-0"
    parts = trimmed.split("-");
  } else {
    return null;
  }

  if (parts.length !== 4) return null;

  const values = parts.map((p) => {
    const n = Number(p);
    return Number.isInteger(n) ? n : NaN;
  });

  if (values.some((v) => isNaN(v) || v < 0 || v > 60)) return null;

  const [e, b, c, t] = values as [number, number, number, number];

  // All-zero is meaningless — reject.
  if (e === 0 && b === 0 && c === 0 && t === 0) return null;

  return { e, b, c, t };
}

/**
 * Canonicalize a parsed tempo back to "E-B-C-T" string form.
 */
export function formatTempo(parsed: ParsedTempo): string {
  return `${parsed.e}-${parsed.b}-${parsed.c}-${parsed.t}`;
}

/**
 * Validate and canonicalize a user-entered tempo string.
 * Returns the canonical "E-B-C-T" string on success, null on failure.
 * Compact form "3010" is accepted and returned as "3-0-1-0".
 */
export function canonicalizeTempo(input: string): string | null {
  const parsed = parseTempo(input);
  if (!parsed) return null;
  return formatTempo(parsed);
}

/**
 * Human-readable accessibility label for a parsed tempo.
 * Used by SetTempoChip accessibilityLabel.
 */
export function tempoAccessibilityLabel(parsed: ParsedTempo): string {
  const phase = (seconds: number, name: string) =>
    `${seconds} second${seconds !== 1 ? "s" : ""} ${name}`;
  return [
    phase(parsed.e, "eccentric"),
    phase(parsed.b, "pause"),
    phase(parsed.c, "concentric"),
    phase(parsed.t, "pause"),
  ].join(", ");
}

// ---- Coach Engine (PR2) ----

export type CoachAbortReason = "manual" | "backgrounded" | "set_completed" | "unmount";
export type CoachPhase = "eccentric" | "bottom_pause" | "concentric" | "top_pause";

export interface CoachOptions {
  onAbort?: (reason: CoachAbortReason) => void;
  /** Called at each phase transition and on cancel (null). Used to drive CoachOverlay phase ring. */
  onPhaseChange?: (phase: CoachPhase | null) => void;
}

export interface CoachSession {
  cancel: (reason?: CoachAbortReason) => void;
  isRunning: () => boolean;
}

// Module-level pub/sub for set-completion signals (AC13).
type SetCompletedListener = () => void;
const setCompletedListeners = new Set<SetCompletedListener>();

/** Subscribe to set-completed signals. Returns an unsubscribe function. */
export function subscribeSetCompleted(listener: SetCompletedListener): () => void {
  setCompletedListeners.add(listener);
  return () => setCompletedListeners.delete(listener);
}

/** Emit set-completed to cancel any active coach session before haptic fires. */
export function emitSetCompleted(): void {
  setCompletedListeners.forEach((l) => l());
}

// Haptic error log-once flag — reset on each new coach session start.
let hapticErrorLogged = false;

/** Test helper — resets the haptic error log flag between tests. */
export function __resetHapticErrorLogForTests(): void {
  hapticErrorLogged = false;
}

// ---- Settings helpers ----

export const TEMPO_COACH_SETTING_KEY = "tempo_coach_enabled";

export async function getTempoCoachEnabled(): Promise<boolean> {
  const val = await getAppSetting(TEMPO_COACH_SETTING_KEY);
  return val === "true";
}

export async function setTempoCoachEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(TEMPO_COACH_SETTING_KEY, enabled ? "true" : "false");
}

// ---- Internal helpers ----

function phaseAtOffset(offsetMs: number, parsed: ParsedTempo): CoachPhase {
  const { e, b, c } = parsed;
  if (offsetMs >= (e + b + c) * 1000) return "top_pause";
  if (offsetMs >= (e + b) * 1000) return "concentric";
  if (offsetMs >= e * 1000) return "bottom_pause";
  return "eccentric";
}

function phaseAnnouncement(phase: CoachPhase): string {
  switch (phase) {
    case "eccentric":
      return "Lower the weight";
    case "bottom_pause":
      return "Hold at the bottom";
    case "concentric":
      return "Lift the weight";
    case "top_pause":
      return "Hold at the top";
  }
}

/**
 * Start a Tempo Coach session for the given tempo string.
 *
 * Returns a CoachSession handle (cancel + isRunning), or null if the tempo
 * string is invalid. The coach:
 *   - Fires selectionAsync haptics at each phase boundary (AC4)
 *   - Fires a double-tick (two haptics ≤80ms apart) at the rep boundary (AC4)
 *   - Falls back to AccessibilityInfo announcements when reduce-motion is on (AC5)
 *   - Activates expo-keep-awake for the session duration (AC12)
 *   - Cancels automatically when the app backgrounds (AC7)
 *   - Cancels on emitSetCompleted() and fires a Success haptic (AC13)
 */
export function startCoach(tempo: string, options: CoachOptions): CoachSession | null {
  const parsedOrNull = parseTempo(tempo);
  if (!parsedOrNull) return null;
  const parsed: ParsedTempo = parsedOrNull;

  hapticErrorLogged = false;
  let cancelled = false;

  // All active timer handles — cleared in cancel() to prevent orphan timers (AC12).
  const timers: ReturnType<typeof setTimeout>[] = [];

  const repDurationMs = (parsed.e + parsed.b + parsed.c + parsed.t) * 1000;

  // Unique phase start offsets (ms) in ascending order.
  const rawOffsets = [
    0,
    parsed.e * 1000,
    (parsed.e + parsed.b) * 1000,
    (parsed.e + parsed.b + parsed.c) * 1000,
    repDurationMs,
  ];
  const uniqueOffsets = [...new Set(rawOffsets)];
  // All offsets except the last are single-tick boundaries; the last is the rep boundary.
  const singleTickOffsets = uniqueOffsets.slice(0, -1);
  const boundaryOffset = uniqueOffsets[uniqueOffsets.length - 1]; // = repDurationMs

  // Anchor all rep timers to an absolute start time so drift does not accumulate across reps (AC4).
  const sessionStartTime = Date.now();

  void KeepAwake.activateKeepAwakeAsync("tempo-coach");

  const appStateSubscription = AppState.addEventListener(
    "change",
    (state: string) => {
      if (state === "background" || state === "inactive") {
        cancel("backgrounded");
      }
    }
  );

  const unsubscribeSetCompleted = subscribeSetCompleted(() => {
    cancel("set_completed");
  });

  function fireHaptic(reduceMotion: boolean, phase: CoachPhase): void {
    if (cancelled) return;
    options.onPhaseChange?.(phase);
    if (reduceMotion) {
      AccessibilityInfo.announceForAccessibility(phaseAnnouncement(phase));
    } else {
      void Haptics.selectionAsync().catch((err: unknown) => {
        if (!hapticErrorLogged) {
          hapticErrorLogged = true;
          console.warn("TempoCoach: haptic unavailable —", err);
        }
      });
    }
  }

  /**
   * Schedule all haptics for repIndex using absolute offsets from sessionStartTime.
   * This prevents per-rep drift accumulation: each boundary fires at exactly
   * sessionStartTime + repIndex * repDurationMs ± JS event-loop jitter (AC4).
   *
   * Each scheduled callback checks its own lateness against the 250ms cap: if the
   * event loop was delayed more than 250ms past the expected fire time the tick is
   * skipped (not fired as a catch-up burst) to honour AC4's latency contract.
   */
  function scheduleRep(repIndex: number, reduceMotion: boolean): void {
    if (cancelled) return;
    const elapsed = Date.now() - sessionStartTime;
    const repStartOffset = repIndex * repDurationMs;

    for (const offset of singleTickOffsets) {
      const expectedMs = repStartOffset + offset;
      const delay = Math.max(0, expectedMs - elapsed);
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          // Skip if JS event loop delivered this tick more than 250ms late (AC4 drift cap).
          if (Date.now() - sessionStartTime - expectedMs > 250) return;
          fireHaptic(reduceMotion, phaseAtOffset(offset, parsed));
        }, delay)
      );
    }

    // Rep boundary: double-tick (two haptics 80ms apart) then schedule next rep.
    const boundaryExpectedMs = repStartOffset + boundaryOffset;
    const boundaryDelay = Math.max(0, boundaryExpectedMs - elapsed);
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        // Skip boundary burst if the outer callback fired >250ms late.
        const boundaryLate = Date.now() - sessionStartTime - boundaryExpectedMs;
        if (boundaryLate > 250) {
          // Even if we skip the double-tick, still schedule the next rep.
          timers.push(setTimeout(() => { if (!cancelled) scheduleRep(repIndex + 1, reduceMotion); }, 81));
          return;
        }
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            fireHaptic(reduceMotion, "top_pause");
          }, 1)
        );
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            fireHaptic(reduceMotion, "top_pause");
          }, 80)
        );
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            scheduleRep(repIndex + 1, reduceMotion);
          }, 81)
        );
      }, boundaryDelay)
    );
  }

  function cancel(reason: CoachAbortReason = "manual"): void {
    if (cancelled) return;
    cancelled = true;
    // Clear all pending timers before they fire (AC12 orphan-timer prevention).
    timers.forEach((id) => clearTimeout(id));
    timers.length = 0;
    options.onPhaseChange?.(null);
    KeepAwake.deactivateKeepAwake("tempo-coach");
    appStateSubscription.remove();
    unsubscribeSetCompleted();
    options.onAbort?.(reason);
    if (reason === "set_completed") {
      // Success haptic guarded the same way as selectionAsync — log-once on native rejection (AC5).
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        (err: unknown) => {
          if (!hapticErrorLogged) {
            hapticErrorLogged = true;
            console.warn("TempoCoach: Success haptic unavailable —", err);
          }
        }
      );
    }
  }

  void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion: boolean) => {
    if (!cancelled) {
      scheduleRep(0, reduceMotion);
    }
  });

  return {
    cancel,
    isRunning: () => !cancelled,
  };
}
