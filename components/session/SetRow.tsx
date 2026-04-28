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
import React, { useCallback, useEffect, useMemo, memo, useState, useRef } from "react";
import { findNodeHandle, I18nManager, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Check, Trash2 } from "lucide-react-native";
import WeightPicker from "../../components/WeightPicker";
import { BodyweightModifierChip } from "./BodyweightModifierChip";
import { SetAttachmentChip } from "./SetAttachmentChip";
import { SetMountPositionChip } from "./SetMountPositionChip";
import { SetGripTypeChip } from "./SetGripTypeChip";
import { SetGripWidthChip } from "./SetGripWidthChip";
import SwipeRowAction from "../../components/SwipeRowAction";
import { getAppSetting, setAppSetting } from "@/lib/db";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { type SetWithMeta } from "./types";
import { SET_TYPE_LABELS, type Equipment } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";
import { PlateHint } from "./PlateHint";
import { useSetCompletionFeedback } from "@/hooks/useSetCompletionFeedback";
import { isCableExercise } from "../../lib/cable-variant";
import { isBodyweightGripExercise, formatGripTypeLabel, formatGripWidthLabel } from "../../lib/bodyweight-grip-variant";

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
  trackingMode: "reps" | "duration";
  equipment: Equipment;
  onUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
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
  // BLD-771: per-set cable variant. Chips are display-only and tap to open
  // the picker via onOpenVariantPicker; long-press clears via onClearVariant
  // (writes NULL/NULL through updateSetVariant — same write path as the
  // picker's Clear button, so the silent-default-trap closure is uniform).
  // Both callbacks are optional; the chips self-suppress when equipment is
  // not cable (gate is isCableExercise(equipment)) so passing the props for
  // non-cable rows is a no-op.
  //
  // Reviewer blocker #4 (PR #426): onOpenVariantPicker accepts a returnFocus
  // node handle so the picker hook can restore VO/TalkBack focus to the
  // originating row on dismiss. SetRow captures its variant footer Pressable
  // via a ref and resolves the handle via React Native's findNodeHandle().
  onOpenVariantPicker?: (setId: string, returnFocusHandle: number | null) => void;
  onClearVariant?: (setId: string) => void;
  // BLD-822: per-set bodyweight grip variant. Chips are display-only and tap
  // to open the bodyweight grip picker via onOpenBodyweightGripPicker;
  // long-press clears via onClearBodyweightGrip (writes NULL/NULL through
  // updateSetBodyweightVariant — same write path as the picker's Clear
  // button). Both callbacks are optional; the chips self-suppress when the
  // exercise does not match the bodyweight-grip gate
  // (isBodyweightGripExercise({equipment, name})), so passing these props
  // for non-matching rows is a no-op.
  //
  // QD-10: SetRow captures its grip footer Pressable via a separate ref
  // (`bodyweightGripFooterRef`) so the grip picker hook restores focus to
  // its own row, never to the cable variant row's `variantFooterRef`.
  exerciseName?: string;
  onOpenBodyweightGripPicker?: (setId: string, returnFocusHandle: number | null) => void;
  onClearBodyweightGrip?: (setId: string) => void;
  // Timer controls (duration mode only)
  isTimerRunning?: boolean;
  isTimerActive?: boolean;
  timerDisplaySeconds?: number;
  onTimerStart?: (setId: string) => void;
  onTimerStop?: (setId: string) => void;
};

export const SetRow = memo(function SetRow({
  set, step, unit, trackingMode, equipment,
  onUpdate, onCheck, onDelete,
  onCycleSetType, onLongPressSetType,
  isTimerRunning, isTimerActive, timerDisplaySeconds,
  onTimerStart, onTimerStop,
  isBodyweight, onOpenBodyweightModifier, onClearBodyweightModifier,
  onOpenVariantPicker, onClearVariant,
  exerciseName, onOpenBodyweightGripPicker, onClearBodyweightGrip,
}: SetRowProps) {
  const colors = useThemeColors();
  // BLD-771: ref to the variant footer Pressable so the picker hook can
  // resolve its accessibility node handle on open and restore VO/TalkBack
  // focus to it on dismiss (reviewer blocker #4, PR #426).
  const variantFooterRef = useRef<View>(null);
  // BLD-822: separate ref for the bodyweight grip footer Pressable. MUST be
  // distinct from variantFooterRef so the grip picker hook restores focus
  // only to grip rows (QD-10). Tested in
  // grip-picker-focus-isolation.test.tsx with both rows mounted in the same
  // render tree (TL-N2).
  const bodyweightGripFooterRef = useRef<View>(null);
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

  // BLD-682: derive the *displayed* value once and key BOTH the picker
  // `value` prop AND the accessibilityLabel off the same expression.
  // Rationale: under option-B hydration `set.weight` is null on a
  // pristine row while `prefillCandidate.weight === 100` is what the
  // picker actually shows. A label keyed off `set.weight ?? 0` would
  // announce "0 kilograms" while the sighted user sees `100`. (AC11.)
  const candidate = set.prefillCandidate ?? null;
  const displayedWeight = set.weight ?? candidate?.weight ?? null;
  const displayedReps = set.reps ?? candidate?.reps ?? null;
  const displayedDuration = set.duration_seconds ?? candidate?.duration_seconds ?? null;
  const unitWord = unit === "lb" ? "pounds" : "kilograms";
  const a11yWeightLabel = `Set ${set.set_number} weight, ${displayedWeight ?? 0} ${unitWord}`;
  const a11yRepsLabel = `Set ${set.set_number} reps, ${displayedReps ?? 0}`;
  const a11yDurationLabel = `Set ${set.set_number} duration, ${displayedDuration ?? 0} seconds`;

  const chipStyle = useMemo(() => {
    switch (set.set_type) {
      case "warmup": return { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant };
      case "dropset": return { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer };
      case "failure": return { bg: colors.errorContainer, fg: colors.onErrorContainer };
      default: return null;
    }
  }, [set.set_type, colors]);

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
                <Text
                  style={{
                    color: colors.onSurfaceVariant,
                    textAlign: "center",
                    fontSize: fontSizes.xs,
                    flexShrink: 1,
                  }}
                  numberOfLines={2}
                >
                  {set.previous.split("\n")[0]}
                </Text>
                <Text
                  style={{
                    color: colors.onSurfaceVariant,
                    textAlign: "center",
                    fontSize: 9,
                    lineHeight: 12,
                    opacity: 0.7,
                    flexShrink: 1,
                  }}
                  numberOfLines={2}
                >
                  {set.previous.split("\n")[1]}
                </Text>
              </>
            ) : (
              <Text
                style={{
                  color: colors.onSurfaceVariant,
                  textAlign: "center",
                  fontSize: fontSizes.xs,
                  flexShrink: 1,
                }}
                numberOfLines={2}
              >
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
                value={displayedWeight}
                step={step}
                unit={unit}
                onValueChange={onWeightChange}
                accessibilityLabel={a11yWeightLabel}
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
                      value={displayedDuration}
                      step={1}
                      onValueChange={onDurationChange}
                      accessibilityLabel={a11yDurationLabel}
                      max={36000}
                    />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.pickerCol}>
              <WeightPicker
                value={displayedReps}
                step={1}
                onValueChange={onRepsChange}
                accessibilityLabel={a11yRepsLabel}
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

      {/*
        BLD-771: Cable variant chips. Rendered as a footer row below the main
        set row (so the 360dp landscape budget for the input row is unchanged,
        per BLD-633 row-density review). Self-suppress when equipment is not
        cable — `isCableExercise()` is the single gate, so adding new cable
        equipment values to the union (lib/cable-variant.ts) makes them
        appear here automatically.

        Tap → onOpenVariantPicker (parent owns picker visibility state and
        routes through the `updateSetVariant` write path).
        Long-press → onClearVariant (writes NULL/NULL — same write path).

        Each chip self-suppresses on null/undefined (BLD-771 plan: chips are
        visible-when-set, picker-tap-target-when-empty); the wrapping
        Pressable below keeps a tap target available even when both chips
        are null, so users can open the picker on a fresh cable set.
      */}
      {isCableExercise({ equipment }) ? (
        <Pressable
          ref={variantFooterRef}
          onPress={() => {
            // Reviewer blocker #4 (PR #426): pass the originating row's
            // accessibility handle to the picker hook so VO/TalkBack focus
            // can be restored to this same Pressable on dismiss.
            const handle = variantFooterRef.current
              ? findNodeHandle(variantFooterRef.current)
              : null;
            onOpenVariantPicker?.(set.id, handle);
          }}
          onLongPress={() => onClearVariant?.(set.id)}
          accessibilityRole="button"
          // QD-8 (BLD-822): a11y composite labels diverge intentionally — cable
          // footer is terse (legacy BLD-771): `"Set 1 cable variant"`. Grip
          // footer (BLD-822, below) enumerates values:
          // `"Set 1 grip variant: Overhand, Narrow"`. Per ux-designer rev-2
          // verdict, ratchet UP via BLD-823 (enrich cable a11y to match
          // grip's enumerated labels), never downgrade grip. Standardize when
          // BLD-823 is implemented; do NOT diverge further without updating
          // both sides.
          accessibilityLabel={`Set ${set.set_number} cable variant`}
          accessibilityHint="Double tap to choose attachment and pulley position; long press to clear"
          style={styles.variantFooter}
        >
          {set.attachment == null && set.mount_position == null ? (
            // Reviewer blocker #3 (PR #426): when both fields are null the
            // chips self-suppress, leaving a zero-height Pressable with no
            // visible tap-target. Render an explicit "Tap to set variant"
            // placeholder so the affordance is discoverable on first-time
            // sets (no autofill history) and after long-press clear. Styled
            // as a dashed-outline pill so it reads as "empty / tap to fill"
            // rather than as a value.
            <View
              style={[
                styles.variantPlaceholder,
                { borderColor: colors.outline },
              ]}
            >
              <Text
                style={[
                  styles.variantPlaceholderLabel,
                  { color: colors.onSurfaceVariant },
                ]}
              >
                Tap to set variant
              </Text>
            </View>
          ) : (
            <>
              <SetAttachmentChip attachment={set.attachment ?? null} />
              <SetMountPositionChip mount={set.mount_position ?? null} />
            </>
          )}
        </Pressable>
      ) : null}

      {/*
        BLD-822: Bodyweight grip variant footer. Sibling to the cable footer
        above — same shape (Pressable wrapping chips, opens picker on tap,
        clears on long-press) but bound to a SEPARATE ref
        (`bodyweightGripFooterRef`) so the grip picker hook restores focus to
        its own row, never to the cable row's `variantFooterRef`. This
        isolation is enforced by the QD-10 mutual-exclusion test fixture
        (TL-N2 single-`it()` shape) in
        `__tests__/hooks/grip-picker-focus-isolation.test.tsx`.

        Mutual exclusion with the cable footer is enforced by the gating
        predicates: `isCableExercise()` requires `equipment.includes("cable")`
        while `isBodyweightGripExercise()` requires `equipment === "bodyweight"`.
        The two are disjoint by construction, so no row ever renders both
        footers. Coexistence with `BodyweightModifierChip` (in `pickerCol`) is
        explicit: weighted pull-ups render the modifier chip in the input row
        AND this grip footer below — independent storage, independent UI.

        Two separate placeholders (per ux-designer QD-9 verdict): when only
        one of grip_type/grip_width is set, the other shows its own
        "Tap to set" affordance. Combining them would break the partial-state
        UX (set has overhand grip but width unspecified — the user needs to
        see that width is the missing axis).

        QD-8: composite a11y label enumerates values, e.g.:
          - both set:    "Set 1 grip variant: Overhand, Narrow. Double-tap to edit."
          - only grip:   "Set 1 grip variant: Overhand, width not set. Double-tap to edit."
          - only width:  "Set 1 grip variant: grip not set, Narrow. Double-tap to edit."
          - both null:   "Set 1 grip variant: not set. Double-tap to choose."
        Cable footer's terse `"Set 1 cable variant"` (above) is intentionally
        terse for now; BLD-823 will ratchet it UP to match this format. Do
        NOT diverge further without updating both blocks.
      */}
      {isBodyweightGripExercise({ equipment, name: exerciseName }) ? (() => {
        const gt = set.grip_type ?? null;
        const gw = set.grip_width ?? null;
        let composite: string;
        if (gt != null && gw != null) {
          composite = `Set ${set.set_number} grip variant: ${formatGripTypeLabel(gt)}, ${formatGripWidthLabel(gw)}. Double-tap to edit.`;
        } else if (gt != null) {
          composite = `Set ${set.set_number} grip variant: ${formatGripTypeLabel(gt)}, width not set. Double-tap to edit.`;
        } else if (gw != null) {
          composite = `Set ${set.set_number} grip variant: grip not set, ${formatGripWidthLabel(gw)}. Double-tap to edit.`;
        } else {
          composite = `Set ${set.set_number} grip variant: not set. Double-tap to choose.`;
        }
        return (
          <Pressable
            ref={bodyweightGripFooterRef}
            onPress={() => {
              const handle = bodyweightGripFooterRef.current
                ? findNodeHandle(bodyweightGripFooterRef.current)
                : null;
              onOpenBodyweightGripPicker?.(set.id, handle);
            }}
            onLongPress={() => onClearBodyweightGrip?.(set.id)}
            accessibilityRole="button"
            accessibilityLabel={composite}
            accessibilityHint="Long press to clear grip and width"
            style={styles.variantFooter}
          >
            {gt == null && gw == null ? (
              <View
                style={[
                  styles.variantPlaceholder,
                  { borderColor: colors.outline },
                ]}
              >
                <Text
                  style={[
                    styles.variantPlaceholderLabel,
                    { color: colors.onSurfaceVariant },
                  ]}
                >
                  Tap to set grip
                </Text>
              </View>
            ) : (
              <>
                {gt != null ? (
                  <SetGripTypeChip gripType={gt} />
                ) : (
                  <View
                    style={[
                      styles.variantPlaceholder,
                      { borderColor: colors.outline },
                    ]}
                  >
                    <Text
                      style={[
                        styles.variantPlaceholderLabel,
                        { color: colors.onSurfaceVariant },
                      ]}
                    >
                      Tap to set grip
                    </Text>
                  </View>
                )}
                {gw != null ? (
                  <SetGripWidthChip gripWidth={gw} />
                ) : (
                  <View
                    style={[
                      styles.variantPlaceholder,
                      { borderColor: colors.outline },
                    ]}
                  >
                    <Text
                      style={[
                        styles.variantPlaceholderLabel,
                        { color: colors.onSurfaceVariant },
                      ]}
                    >
                      Tap to set width
                    </Text>
                  </View>
                )}
              </>
            )}
          </Pressable>
        );
      })() : null}

      <PlateHint weight={displayedWeight} unit={unit} equipment={equipment} />
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
  // BLD-771: footer row for cable variant chips. flexWrap so on narrow
  // screens (360dp landscape) the second chip wraps below rather than
  // overflowing. paddingLeft aligns the chips with the set-number column.
  variantFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingLeft: 36,
    paddingTop: 2,
    paddingBottom: 2,
  },
  // BLD-771: empty-state placeholder pill rendered when both attachment
  // and mount_position are null. Dashed outline reads as "tap to fill"
  // rather than as a real chip value, while keeping a visible tap target
  // for the picker.
  variantPlaceholder: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    alignSelf: "center",
  },
  variantPlaceholderLabel: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
    fontWeight: "500",
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
    width: 88,
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
