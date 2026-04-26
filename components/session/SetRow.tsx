/* eslint-disable complexity, max-lines-per-function */
/**
 * SetRow — Hard Exclusions (Behavior-Design Classification: NO).
 * This file MUST NOT introduce any of the following. If any of these is
 * added, flip Classification to YES and require fresh psychologist review:
 *   - no streaks
 *   - no badges
 *   - no celebrations
 *   - no animations on goal-hit
 *   - no haptics (commit haptic owned exclusively by useSetCompletionFeedback;
 *     swipe gesture path emits no independent haptic — BLD-559 / BLD-614)
 *   - no success-toasts
 *   - no notifications
 *   - no reminders
 *
 * Convergence: tap on the checkmark Pressable, swipe-right past threshold,
 * and the VoiceOver "Mark complete" custom action all route through the
 * same `handleCheckPress` callback. There is no second prop on this
 * component for the swipe-complete path; `app/session/[id].tsx` does not
 * wire any extra prop for it.
 */
import React, { useCallback, useEffect, useMemo, memo, useState } from "react";
import { I18nManager, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Check, Trash2 } from "lucide-react-native";
import WeightPicker from "../../components/WeightPicker";
import { BodyweightModifierChip } from "./BodyweightModifierChip";
import SwipeRowAction from "../../components/SwipeRowAction";
import { getAppSetting, setAppSetting } from "@/lib/db";
import { rpeColor, rpeText } from "../../lib/rpe";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { RPE_CHIPS, RPE_LABELS, type SetWithMeta } from "./types";
import { SET_TYPE_LABELS, type Equipment } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";
import { PlateHint } from "./PlateHint";
import { useSetCompletionFeedback } from "@/hooks/useSetCompletionFeedback";

const SWIPE_COMPLETE_HINT_KEY = "hint:swipe-complete-set:v1";

// Module-level claim: ensures exactly one SetRow caller per JS runtime ever
// receives `won=true` for the swipe-right discoverability hint.
//
// State machine:
//   1. `inFlight` — a promise representing the currently-running DB read+write.
//      Concurrent same-tick callers all `await` it; whichever caller's invocation
//      created it is the ONLY one that may receive `true`.
//   2. `consumed` — once any caller has either resolved `true` (winner) or
//      observed `seen` (loser), every subsequent call returns `false` without
//      touching the DB. This stops the hint from replaying on later sessions
//      within the same app runtime (e.g. user navigates Dashboard → Session
//      twice — the second mount must not see `true` again).
let swipeCompleteHintInFlight: Promise<boolean> | null = null;
let swipeCompleteHintConsumed = false;
function claimSwipeCompleteHintOnce(): Promise<boolean> {
  if (swipeCompleteHintConsumed) return Promise.resolve(false);
  if (swipeCompleteHintInFlight) {
    // Concurrent caller — losers always see false even if the inflight winner
    // resolves true. Chain off the same promise so we wait for completion.
    return swipeCompleteHintInFlight.then(() => false);
  }
  swipeCompleteHintInFlight = (async () => {
    try {
      const seen = await getAppSetting(SWIPE_COMPLETE_HINT_KEY);
      if (seen) return false;
      await setAppSetting(SWIPE_COMPLETE_HINT_KEY, "1");
      return true;
    } catch {
      return false;
    } finally {
      swipeCompleteHintConsumed = true;
    }
  })();
  return swipeCompleteHintInFlight;
}

// Test-only: reset the module-level claim state. Exported under a `__` prefix
// to discourage production use.
export function __resetSwipeCompleteHintClaimForTests(): void {
  swipeCompleteHintInFlight = null;
  swipeCompleteHintConsumed = false;
}
export const __claimSwipeCompleteHintOnceForTests = claimSwipeCompleteHintOnce;

export function formatDurationDisplay(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "0:00";
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type SetRowProps = {
  set: SetWithMeta;
  step: number;
  unit: "kg" | "lb";
  halfStep: { setId: string; base: number } | null;
  trackingMode: "reps" | "duration";
  equipment: Equipment;
  onUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onRPE: (set: SetWithMeta, val: number) => void;
  onHalfStep: (setId: string, val: number) => void;
  onHalfStepClear: () => void;
  onHalfStepOpen: (setId: string, base: number) => void;
  onCycleSetType: (setId: string) => void;
  onLongPressSetType: (setId: string) => void;
  // Bodyweight modifier (only used when isBodyweight === true).
  // When bodyweight, the pickerCol slot renders BodyweightModifierChip instead
  // of WeightPicker; onOpenBodyweightModifier opens the sheet. Long-press
  // clears to BW-only via onClearBodyweightModifier — MUST NOT fall through
  // to onLongPressSetType (collision assertion, BLD-541 AC-10).
  isBodyweight?: boolean;
  onOpenBodyweightModifier?: (setId: string) => void;
  onClearBodyweightModifier?: (setId: string) => void;
  // Timer controls (duration mode only)
  isTimerRunning?: boolean;
  isTimerActive?: boolean;
  timerDisplaySeconds?: number;
  onTimerStart?: (setId: string) => void;
  onTimerStop?: (setId: string) => void;
};

export const SetRow = memo(function SetRow({
  set, step, unit, halfStep, trackingMode, equipment,
  onUpdate, onCheck, onDelete, onRPE, onHalfStep, onHalfStepClear,
  onHalfStepOpen, onCycleSetType, onLongPressSetType,
  isTimerRunning, isTimerActive, timerDisplaySeconds,
  onTimerStart, onTimerStop,
  isBodyweight, onOpenBodyweightModifier, onClearBodyweightModifier,
}: SetRowProps) {
  const colors = useThemeColors();
  // BLD-559: synchronous confirmation feedback owned exclusively here.
  // usePRCelebration MUST NOT fire haptic/audio. Any change here requires
  // psychologist re-review per PLAN-BLD-559.
  const { fire: fireSetCompletionFeedback } = useSetCompletionFeedback();

  // BLD-614: one-time swipe-right discoverability hint.
  // Gated by a persistent flag in app_settings (codebase convention; AsyncStorage
  // is not installed). The first SetRow rendered after this feature ships
  // wins the race and sets the flag, so the hint plays exactly once per device.
  const [showSwipeRightHint, setShowSwipeRightHint] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (set.set_number !== 1) return;
    claimSwipeCompleteHintOnce().then((won) => {
      if (cancelled) return;
      if (won) setShowSwipeRightHint(true);
    });
    return () => {
      cancelled = true;
    };
  }, [set.set_number]);

  const handleCheckPress = useCallback(() => {
    // Fire feedback synchronously ONLY on false → true transition.
    if (!set.completed) {
      fireSetCompletionFeedback();
    }
    onCheck(set);
  }, [set, onCheck, fireSetCompletionFeedback]);

  const onWeightChange = useCallback((v: number) => onUpdate(set.id, "weight", String(v)), [set.id, onUpdate]);
  const onRepsChange = useCallback((v: number) => onUpdate(set.id, "reps", String(v)), [set.id, onUpdate]);
  const onDurationChange = useCallback((v: number) => onUpdate(set.id, "duration_seconds", String(v)), [set.id, onUpdate]);

  const isDurationMode = trackingMode === "duration";

  const chipStyle = useMemo(() => {
    switch (set.set_type) {
      case "warmup": return { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant };
      case "dropset": return { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer };
      case "failure": return { bg: colors.errorContainer, fg: colors.onErrorContainer };
      default: return null;
    }
  }, [set.set_type, colors]);

  const borderColor = chipStyle?.bg;
  const chipLabel = SET_TYPE_LABELS[set.set_type]?.short;
  const typeLabel = set.set_type === "normal" ? "working set" : `${set.set_type} set`;

  const handleDelete = useCallback(() => onDelete(set.id), [onDelete, set.id]);
  // Screen-reader fallback: TalkBack / VoiceOver dispatch the built-in
  // "activate" action when the user double-taps a focused, accessible element.
  const onDeleteAccessibilityAction = useCallback(
    (e: { nativeEvent: { actionName: string } }) => {
      if (e.nativeEvent.actionName === "activate") handleDelete();
    },
    [handleDelete],
  );

  const onCheckAccessibilityAction = useCallback(
    (e: { nativeEvent: { actionName: string } }) => {
      if (e.nativeEvent.actionName === "complete") handleCheckPress();
    },
    [handleCheckPress],
  );

  return (
    <View testID={`set-${set.id}-row`}>
      <SwipeRowAction
        widthBasis="container"
        showHint={showSwipeRightHint ? "right" : false}
        left={{
          fraction: 0.5,
          minPx: 120,
          velocity: 1500,
          velocityMinTranslatePx: 80,
          color: colors.error,
          icon: Trash2,
          label: `Delete set ${set.set_number}`,
          haptic: true,
          commitBehavior: "slide-out",
          callback: handleDelete,
        }}
        right={{
          fraction: 0.35,
          minPx: 80,
          velocity: 1500,
          velocityMinTranslatePx: 80,
          color: colors.primary,
          icon: Check,
          label: `Mark set ${set.set_number} complete`,
          haptic: false,
          commitBehavior: "snap-back",
          callback: handleCheckPress,
        }}
      >
        <View
          style={[
            styles.setRow,
            { backgroundColor: colors.background },
            // Outline highlight when completed (BLD-613). The base style reserves
            // a 2px transparent border so the row's outer dimensions are byte-identical
            // between completed and non-completed states — only the color toggles.
            set.completed && { borderColor: colors.primary },
            borderColor ? { borderLeftWidth: 3, borderLeftColor: borderColor } : undefined,
          ]}
          accessibilityHint={
            I18nManager.isRTL
              ? "Swipe left to complete, swipe right to delete"
              : "Swipe right to complete, swipe left to delete"
          }
        >
          <Pressable
            onPress={() => onCycleSetType(set.id)}
            onLongPress={() => onLongPressSetType(set.id)}
            hitSlop={10}
            style={[styles.colSet, { minHeight: 36 }]}
            accessibilityRole="button"
            accessibilityLabel={`Set ${set.set_number}, ${typeLabel}`}
            accessibilityHint="Double tap to cycle set type. Long press for direct selection."
            accessibilityLiveRegion="polite"
          >
            {chipLabel ? (
              <View style={[styles.warmupChip, { backgroundColor: chipStyle!.bg }]}>
                <Text style={{ color: chipStyle!.fg, fontSize: fontSizes.sm, fontWeight: "700" }}>{chipLabel}</Text>
              </View>
            ) : (
              <View style={styles.setNumberContainer}>
                {set.is_pr && <Text style={styles.prBadge}>🏆</Text>}
                <Text variant="body" style={{ color: colors.onSurface, textAlign: "center" }}>
                  {set.round ? `R${set.round}` : set.set_number}
                </Text>
              </View>
            )}
          </Pressable>
          <View style={styles.colPrev}>
            {set.previous?.includes("\n") ? (
              <>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
                  {set.previous.split("\n")[0]}
                </Text>
                <Text style={{ color: colors.onSurfaceVariant, textAlign: "center", fontSize: 9, lineHeight: 12, opacity: 0.7 }}>
                  {set.previous.split("\n")[1]}
                </Text>
              </>
            ) : (
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
                {set.previous}
              </Text>
            )}
          </View>
          <View style={styles.pickerCol}>
            {isBodyweight ? (
              <BodyweightModifierChip
                modifierKg={set.bodyweight_modifier_kg ?? null}
                unit={unit}
                onPress={() => onOpenBodyweightModifier?.(set.id)}
                onLongPress={() => onClearBodyweightModifier?.(set.id)}
                setNumber={set.set_number}
              />
            ) : (
              <WeightPicker
                value={set.weight}
                step={step}
                unit={unit}
                onValueChange={onWeightChange}
                accessibilityLabel={`Set ${set.set_number} weight`}
              />
            )}
          </View>
          {isDurationMode ? (
            <View style={styles.durationCol}>
              <View style={styles.durationRow}>
                <Pressable
                  onPress={() => {
                    if (isTimerActive && isTimerRunning) {
                      onTimerStop?.(set.id);
                    } else {
                      onTimerStart?.(set.id);
                    }
                  }}
                  style={[
                    styles.timerButton,
                    { backgroundColor: isTimerActive && isTimerRunning ? colors.error : colors.primary },
                  ]}
                  accessibilityLabel={isTimerActive && isTimerRunning ? "Stop set timer" : "Start set timer"}
                  accessibilityHint={isTimerActive && isTimerRunning
                    ? "Double tap to stop and record duration"
                    : "Double tap to start timing this set"}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name={isTimerActive && isTimerRunning ? "stop" : "play"}
                    size={22}
                    color={isTimerActive && isTimerRunning ? colors.onError : colors.onPrimary}
                  />
                </Pressable>
                {isTimerActive && isTimerRunning ? (
                  <Text
                    style={[styles.timerDisplay, { color: colors.primary }]}
                    accessibilityRole="timer"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={`Timer: ${formatDurationDisplay(timerDisplaySeconds ?? 0)}`}
                  >
                    {formatDurationDisplay(timerDisplaySeconds ?? 0)}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }}>
                    <WeightPicker
                      value={set.duration_seconds}
                      step={1}
                      onValueChange={onDurationChange}
                      accessibilityLabel={`Set ${set.set_number} duration, ${set.duration_seconds ?? 0} seconds`}
                      max={36000}
                    />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.pickerCol}>
              <WeightPicker
                value={set.reps}
                step={1}
                onValueChange={onRepsChange}
                accessibilityLabel={`Set ${set.set_number} reps`}
                max={999}
              />
            </View>
          )}
          <Pressable
            onPress={handleCheckPress}
            // Asymmetric hitSlop: expand up/down/left for gloved taps without
            // eating into the adjacent delete Pressable's hit region on the
            // right. Effective hit box: 60w × 72h (visible 48 + slop).
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 0 }}
            style={[
              styles.circleCheck,
              { borderColor: set.completed ? colors.primary : colors.onSurfaceVariant },
              set.completed && { backgroundColor: colors.primary },
            ]}
            accessibilityLabel={`Mark set ${set.set_number} ${set.completed ? "incomplete" : "complete"}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: set.completed }}
            accessibilityActions={[{ name: "complete", label: "Mark complete" }]}
            onAccessibilityAction={onCheckAccessibilityAction}
          >
            {set.completed && (
              <MaterialCommunityIcons name="check" size={18} color={colors.onPrimary} />
            )}
          </Pressable>
          <Pressable
            // Sighted: swipe is the primary delete path; single-tap is a
            // no-op (no onPress) so sweaty/gloved fingers cannot misfire.
            // Long-press (≥600ms) remains as a deliberate secondary path.
            // a11y: accessible + role=button makes this a VoiceOver / TalkBack
            // focus stop; the built-in "activate" action (fired on VO/TB
            // double-tap) invokes onDelete directly so screen-reader users
            // have a discoverable delete without needing to perform the
            // swipe gesture.
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Delete set ${set.set_number}`}
            accessibilityHint={`Long-press to delete, or swipe the row ${I18nManager.isRTL ? "right" : "left"}`}
            accessibilityActions={[{ name: "activate", label: `Delete set ${set.set_number}` }]}
            onAccessibilityAction={onDeleteAccessibilityAction}
            onLongPress={handleDelete}
            delayLongPress={600}
            style={styles.actionBtn}
            testID={`set-${set.id}-delete-hint`}
          >
            <MaterialCommunityIcons
              name="delete-outline"
              size={22}
              color={colors.error}
              style={{ opacity: 0.35 }}
            />
          </Pressable>
        </View>
      </SwipeRowAction>

      <PlateHint weight={set.weight} unit={unit} equipment={equipment} />

      {set.completed && (
        <View style={styles.rpeRow} accessibilityLabel="Rate of perceived exertion" accessibilityRole="radiogroup">
          {RPE_CHIPS.map((val) => {
            const selected = set.rpe === val;
            return (
              <Pressable
                key={val}
                onPress={() => onRPE(set, val)}
                onLongPress={() => onHalfStepOpen(set.id, val)}
                style={[
                  styles.rpeChip,
                  { borderColor: rpeColor(val) },
                  selected && { backgroundColor: rpeColor(val) },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`RPE ${val} ${RPE_LABELS[val]}`}
              >
                <Text style={[styles.rpeChipText, { color: selected ? rpeText(val) : rpeColor(val) }]}>
                  {val} {RPE_LABELS[val]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {halfStep && halfStep.setId === set.id && (
        <View style={[styles.halfStepRow, { backgroundColor: colors.surfaceVariant }]}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginRight: 8, fontSize: fontSizes.xs }}>
            Half-step:
          </Text>
          {halfStep.base > 6 && (
            <Pressable
              onPress={() => onHalfStep(set.id, halfStep.base - 0.5)}
              style={[styles.halfChip, { borderColor: rpeColor(halfStep.base - 0.5) }]}
              accessibilityLabel={`RPE ${halfStep.base - 0.5}`}
            >
              <Text style={[styles.rpeChipText, { color: rpeColor(halfStep.base - 0.5) }]}>
                {halfStep.base - 0.5}
              </Text>
            </Pressable>
          )}
          {halfStep.base < 10 && (
            <Pressable
              onPress={() => onHalfStep(set.id, halfStep.base + 0.5)}
              style={[styles.halfChip, { borderColor: rpeColor(halfStep.base + 0.5) }]}
              accessibilityLabel={`RPE ${halfStep.base + 0.5}`}
            >
              <Text style={[styles.rpeChipText, { color: rpeColor(halfStep.base + 0.5) }]}>
                {halfStep.base + 0.5}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onHalfStepClear}
            style={[styles.halfChip, { borderColor: colors.outline }]}
            accessibilityLabel="Cancel half-step picker"
          >
            <Text style={[styles.rpeChipText, { color: colors.onSurfaceVariant }]}>✕</Text>
          </Pressable>
        </View>
      )}

      {set.completed && set.rpe != null && !Number.isInteger(set.rpe) && (
        <View style={styles.rpeBadgeRow}>
          <View style={[styles.rpeBadge, { backgroundColor: rpeColor(set.rpe) }]}>
            <Text style={{ color: rpeText(set.rpe), fontSize: fontSizes.xs, fontWeight: "600" }}>
              RPE {set.rpe}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: "transparent",
    marginBottom: 2,
  },
  colSet: {
    width: 36,
    textAlign: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  setNumberContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  prBadge: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
  },
  colPrev: {
    width: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  warmupChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  circleCheck: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rpeRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 6,
    flexWrap: "wrap",
  },
  rpeChip: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 52,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  rpeChipText: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
  halfStepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 4,
    marginBottom: 4,
    gap: 8,
  },
  halfChip: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  rpeBadgeRow: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  rpeBadge: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  durationCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timerButton: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
    minHeight: 56,
  },
  timerDisplay: {
    fontSize: fontSizes.xl,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flex: 1,
    textAlign: "center",
  },
});
