/* eslint-disable complexity, max-lines-per-function, max-lines */
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
import { findNodeHandle, I18nManager, Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Check, Trash2 } from "lucide-react-native";
import WeightPicker from "../../components/WeightPicker";
import { BodyweightModifierChip } from "./BodyweightModifierChip";
import { SetAttachmentChip } from "./SetAttachmentChip";
import { SetMountPositionChip } from "./SetMountPositionChip";
import { SetTempoChip } from "./SetTempoChip";
import { SetPulleyPinChip } from "./SetPulleyPinChip";
import { SetGripTypeChip } from "./SetGripTypeChip";
import { SetGripWidthChip } from "./SetGripWidthChip";
import SwipeRowAction from "../../components/SwipeRowAction";
import { getAppSetting, setAppSetting } from "@/lib/db";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { type SetWithMeta } from "./types";
import { SET_TYPE_LABELS, type Equipment } from "../../lib/types";
import { ADVANCED_SET_TYPES } from "../../lib/db/sets";
import { fontSizes } from "@/constants/design-tokens";
import { PlateHint } from "./PlateHint";
import { useSetCompletionFeedback } from "@/hooks/useSetCompletionFeedback";
import { isCableExercise, formatAttachmentLabel, formatMountPositionLabel } from "../../lib/cable-variant";
import { isBodyweightGripExercise, formatGripTypeLabel, formatGripWidthLabel } from "../../lib/bodyweight-grip-variant";
import { RpeChipStrip } from "./RpeChipStrip";
import { SetWeightCell } from "./SetWeightCell";
import { SetTimerCell } from "./SetTimerCell";
import { StackMarkerHint } from "./StackMarkerHint";
import type { StackWithCalibrations } from "@/hooks/useActiveCalibration";
import { MiniSetEditor } from "./MiniSetEditor";
import { SessionWeightStepper } from "./SessionWeightStepper";

const SWIPE_COMPLETE_HINT_KEY = "hint:swipe-complete-set:v1";

// BLD-1130 G3: stable empty-array reference so SetRows without calibration
// don't get a new prop identity each render (preserves React.memo bailouts).
const EMPTY_STACKS: StackWithCalibrations[] = [];

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

// Re-exported from timerUtils for backward compatibility with tests and other
// importers that reference it here.
export { formatDurationDisplay } from "./timerUtils";

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
  // BLD-1235: exerciseId + setIndex replace the old timer props; timer state
  // is now in SetTimerContext, consumed only by SetTimerCell.
  exerciseId?: string;
  setIndex?: number;
  // BLD-1092: Form Check Video glyph (video-outline / video-check).
  // Only rendered on completed sets. onVideoGlyph opens the capture sheet
  // (no clip) or the player sheet (clip exists).
  hasClip?: boolean;
  onVideoGlyph?: (setId: string) => void;
  pulleyPin?: number | null;
  onOpenPulleyPinPicker?: (setId: string) => void;
  showPulleyPin?: boolean;
  hasSetupPhoto?: boolean;
  setupPhotoUri?: string;
  onSetupPhotoGlyph?: (setId: string) => void;
  // BLD-1110: Live RPE capture. captureRpe enables the 4-chip strip under
  // completed sets. onRpeChange writes to DB + emits breadcrumb in parent.
  captureRpe?: boolean;
  onRpeChange?: (setId: string, rpe: number | null) => void;
  // BLD-1126: Stack Marker Quick-Pick.
  // BLD-1130 G3: stacks fetched once in ExerciseGroupCard and prop-drilled.
  // Empty array = no calibration / not cable. onMarkerConfirm writes the five
  // stack columns atomically (AC3). onManualWeightSave writes weight + reps
  // AND clears stack columns (AC5). gymId is accepted for API compatibility
  // but calibration is fetched in ExerciseGroupCard, not here (BLD-1130 G3).
  gymId?: string | null;
  stacks?: StackWithCalibrations[];
  onMarkerConfirm?: (setId: string, result: {
    stackId: string;
    stackName: string;
    marker: number;
    trueWeight: number;
    unit: string;
  }) => void;
  onManualWeightSave?: (setId: string, weight: number | null, reps: number | null) => void;
  /** BLD-1175: Mini-set segment handlers — only present for advanced set types in active session. */
  onAddSegment?: (setId: string, reps: number) => Promise<void> | void;
  onDeleteSegment?: (segmentId: string, setId: string) => Promise<void> | void;
  onCollapseToNormal?: (setId: string) => Promise<void> | void;
};

export const SetRow = memo(function SetRow({
  set, step, unit, trackingMode, equipment,
  onUpdate, onCheck, onDelete,
  onCycleSetType, onLongPressSetType,
  exerciseId, setIndex,
  isBodyweight, onOpenBodyweightModifier, onClearBodyweightModifier,
  onOpenVariantPicker, onClearVariant,
  exerciseName, onOpenBodyweightGripPicker, onClearBodyweightGrip,
  hasClip, onVideoGlyph,
  pulleyPin, onOpenPulleyPinPicker, showPulleyPin, hasSetupPhoto, setupPhotoUri, onSetupPhotoGlyph,
  captureRpe, onRpeChange,
  stacks, onMarkerConfirm, onManualWeightSave,
  onAddSegment, onDeleteSegment, onCollapseToNormal,
}: SetRowProps) {
  const colors = useThemeColors();
  // BLD-1175: controlled next-reps input for MiniSetEditor — scoped to this row
  // so each advanced set row tracks its own reps draft independently.
  const [nextReps, setNextReps] = useState<number | null>(null);
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
      case "rest_pause": return { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer };
      case "cluster": return { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer };
      case "myo_reps": return { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer };
      default: return null;
    }
  }, [set.set_type, colors]);

  const chipLabel = SET_TYPE_LABELS[set.set_type]?.short;
  const typeLabel = set.set_type === "normal" ? "working set" : `${SET_TYPE_LABELS[set.set_type]?.label ?? set.set_type} set`;

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

  // BLD-1110: stable callback keyed on set.id only per Tech N2 spec.
  // This keeps React.memo effective — parent re-renders don't create new fn refs.
  const handleRpeChange = useCallback(
    (rpe: number | null) => onRpeChange?.(set.id, rpe),
    [set.id, onRpeChange],
  );

  // BLD-1126: Stack marker calibration. BLD-1130 G3: now prop-drilled from
  // ExerciseGroupCard (fetched once per group). Falls back to a stable empty
  // array so React.memo bailouts hold.
  const stacksProp = stacks ?? EMPTY_STACKS;
  const isCable = isCableExercise({ equipment });
  // BLD-1841: the uncalibrated-cable hint must render full-width as a row
  // footer (see the JSX footer below), NOT inside the narrow weight column.
  // Mirrors SetWeightCell's gate (isCable && no calibrations on any stack).
  const hasCalibration = stacksProp.some((s) => s.calibrations.length > 0);
  const showStackMarkerHint = isCable && !hasCalibration;

  // BLD-2674: Quick Weight Stepper gate.
  //
  // Show the stepper footer for Case C rows ONLY (plain numeric weight).
  // Gating rules (from PLAN-BLD-2674 rev 3, APPROVED):
  //   Case A (StackMarkerPill): no stepper (handled inside SetWeightCell routing,
  //     which this gate never sees, but also guarded: isBodyweight=false here)
  //   Case B (cable + calibrated + manual/legacy): SUPPRESS — the ↕ marker path
  //     is primary; we must not stack WeightPicker + ↕ + − + + in narrow pickerCol
  //     (TL required condition (b))
  //   Case C (plain numeric weight): stepper renders
  //   Completed Case C + RPE: SUPPRESS (option B from plan) — the 96dp budget is
  //     consumed by main+standalone-RPE+PlateHint; adding a stepper band breaches it
  //     (TL required condition (d))
  //   Bodyweight: no stepper (isBodyweight guard + pickerCol renders BodyweightModifierChip)
  //   Duration: no stepper (weight irrelevant)
  //   Cable (any variant): SUPPRESS — cable rows use stack marker / manual weight UI;
  //     both calibrated (Case B) and uncalibrated rows show StackMarkerHint instead.
  //     BLD-2688: widen gate from !isCaseBRow (calibrated-cable only) to !isCable (all cable).
  const isCompletedWithRpe = set.completed && captureRpe;
  const showWeightStepper =
    !isBodyweight &&
    !isCable &&
    !isDurationMode &&
    !isCompletedWithRpe;

  const handleMarkerConfirm = useCallback(
    (result: { stackId: string; stackName: string; marker: number; trueWeight: number; unit: string }) => {
      onMarkerConfirm?.(set.id, result);
    },
    [set.id, onMarkerConfirm],
  );

  const handleManualWeightSave = useCallback(
    (weight: number | null) => {
      onManualWeightSave?.(set.id, weight, set.reps ?? null);
    },
    [set.id, set.reps, onManualWeightSave],
  );

  // BLD-1110: RPE chip strip element, shared across Case A/B/C footer topologies.
  const rpeStrip = set.completed && captureRpe
    ? <RpeChipStrip value={set.rpe ?? null} onChange={handleRpeChange} setId={set.id} />
    : null;

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
              <SetWeightCell
                setId={set.id}
                setNumber={set.set_number}
                weight={set.weight ?? null}
                stackMarker={set.stack_marker ?? null}
                stackUnit={set.stack_unit_at_log ?? null}
                displayedWeight={displayedWeight}
                step={step}
                unit={unit}
                isCable={isCable}
                stacks={stacksProp}
                accessibilityLabel={a11yWeightLabel}
                testID={`set-${set.set_number}-weight`}
                onWeightChange={onWeightChange}
                onManualWeightSave={handleManualWeightSave}
                onMarkerConfirm={handleMarkerConfirm}
              />
            )}
          </View>
          {isDurationMode ? (
            <View style={styles.durationCol}>
              {/* BLD-1235: SetTimerCell subscribes to SetTimerContext directly,
                  so only it re-renders each second. SetRow.memo stays stable. */}
              <SetTimerCell
                setId={set.id}
                exerciseId={exerciseId}
                setIndex={setIndex}
                displayedDuration={displayedDuration ?? 0}
                step={1}
                onDurationChange={onDurationChange}
                accessibilityLabel={a11yDurationLabel}
              />
            </View>
          ) : (
            <View style={styles.pickerCol}>
              <WeightPicker
                value={displayedReps}
                step={1}
                onValueChange={onRepsChange}
                accessibilityLabel={a11yRepsLabel}
                testID={`set-${set.set_number}-reps`}
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
          {/* BLD-1092: Form Check Video glyph. Only rendered on completed sets.
              Visual size 24 dp; effective touch target ≥48×48 dp via hitSlop.
              hitSlop left:6 right:6 avoids overlap with check circle (right:0
              hitSlop) and delete button. */}
          {set.completed && Platform.OS !== "web" && (
            <Pressable
              onPress={() => onVideoGlyph?.(set.id)}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              style={styles.videoGlyphBtn}
              accessibilityRole="button"
              accessibilityLabel={
                hasClip
                  ? `View form clip for set ${set.set_number}`
                  : `Record form clip for set ${set.set_number}`
              }
            >
              <MaterialCommunityIcons
                name={hasClip ? "video-check" : "video-outline"}
                size={22}
                color={hasClip ? colors.primary : colors.onSurfaceVariant}
              />
            </Pressable>
          )}
          {set.completed && Platform.OS !== "web" && isCableExercise({ equipment }) && (
            <Pressable
              onPress={() => onSetupPhotoGlyph?.(set.id)}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              style={styles.videoGlyphBtn}
              accessibilityRole="button"
              accessibilityLabel={
                hasSetupPhoto
                  ? `View setup photo for set ${set.set_number}`
                  : `Take setup photo for set ${set.set_number}`
              }
            >
              {setupPhotoUri ? (
                <Image
                  source={{ uri: setupPhotoUri }}
                  style={styles.setupPhotoThumb}
                  resizeMode="cover"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : (
                <MaterialCommunityIcons
                  name={hasSetupPhoto ? "camera-plus" : "camera-plus-outline"}
                  size={22}
                  color={hasSetupPhoto ? colors.primary : colors.onSurfaceVariant}
                />
              )}
            </Pressable>
          )}
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
        BLD-2674: Quick Weight Stepper — compact full-width footer-row stepper.
        Rendered as a sibling below the main set row (BLD-1841 pattern, same
        topology as StackMarkerHint at :649 and the cable variant footer at :669).
        Gating: Case C rows only (plain numeric weight). Suppressed for:
          - bodyweight rows (isBodyweight)
          - Case B rows (cable + calibrated manual/legacy: isCaseBRow)
          - duration/time rows (isDurationMode)
          - completed Case C rows with RPE capture on (isCompletedWithRpe —
            the 96dp height budget is already consumed; TL condition (d), plan rev 3)
        The center editable WeightPicker stays in pickerCol on the main row, untouched.
      */}
      {showWeightStepper && (
        <SessionWeightStepper
          displayedWeight={displayedWeight}
          step={step}
          unit={unit}
          onValueChange={onWeightChange}
          testID={`set-${set.set_number}-weight-stepper`}
        />
      )}

      {/*
        BLD-1841: uncalibrated-cable stack-marker hint. Previously rendered
        inside SetWeightCell, i.e. inside the narrow flex:1 weight column
        (pickerCol ≈ 25px on a 320px emulator), so its full-sentence label
        wrapped one character per line into a tall vertical strip — a real
        layout defect on cable exercises at uncalibrated gyms, caught by the
        log-set e2e gate (run 28059103882 failure screenshot). Rendering it
        here as a full-width row footer (sibling of the main set row, like the
        cable-variant footer below) gives the banner the full row width.
        The component self-suppresses once dismissed and while the dismissal
        query is loading.
      */}
      {showStackMarkerHint && <StackMarkerHint />}

      {/*
        BLD-771: Cable variant chips. Rendered as a footer row below the main
        set row (so the 360dp landscape budget for the input row is unchanged,
        per BLD-633 row-density review). Self-suppress when equipment is not
        cable — `isCableExercise()` is the single gate, so adding new cable
        equipment values to the union (lib/cable-variant.ts) makes them
        appear here automatically.

        BLD-1110: When captureRpe is ON and the set is completed, the RPE
        chip strip is merged into this same footer row (right-aligned). This
        keeps the combined height ≤ 96 dp (Case A topology: main 48 +
        variant-footer-with-RPE 28-32 + PlateHint ~14 = ≤ 96 dp).

        Tap → onOpenVariantPicker (parent owns picker visibility state and
        routes through the `updateSetVariant` write path).
        Long-press → onClearVariant (writes NULL/NULL — same write path).
      */}
      {isCableExercise({ equipment }) ? (
        <View style={styles.footerWithRpe}>
          <View style={[styles.variantFooter, styles.footerFlex]}>
            <Pressable
              ref={variantFooterRef}
              onPress={() => {
                const handle = variantFooterRef.current
                  ? findNodeHandle(variantFooterRef.current)
                  : null;
                onOpenVariantPicker?.(set.id, handle);
              }}
              onLongPress={() => onClearVariant?.(set.id)}
              accessibilityRole="button"
              accessibilityLabel={(() => {
                const att = set.attachment ?? null;
                const mp = set.mount_position ?? null;
                if (att != null && mp != null) {
                  return `Set ${set.set_number} cable variant: ${formatAttachmentLabel(att)}, ${formatMountPositionLabel(mp)}. Double-tap to edit.`;
                } else if (att != null) {
                  return `Set ${set.set_number} cable variant: ${formatAttachmentLabel(att)}, position not set. Double-tap to edit.`;
                } else if (mp != null) {
                  return `Set ${set.set_number} cable variant: attachment not set, ${formatMountPositionLabel(mp)}. Double-tap to edit.`;
                }
                return `Set ${set.set_number} cable variant: not set. Double-tap to choose.`;
              })()}
              accessibilityHint="Long press to clear attachment and position"
              style={styles.footerChipGroup}
            >
              {set.attachment == null && set.mount_position == null ? (
                <View
                  style={[
                    styles.variantPlaceholder,
                    // BLD-2386 Item D3: lighter visual weight on unset placeholder.
                    // Still mounted + visible for a11y (ref focus-restore contract).
                    // accessibilityState={{ expanded }} is N/A under D3 — no collapse/expand.
                    styles.variantPlaceholderLight,
                    { borderColor: colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.variantPlaceholderLabel,
                      styles.variantPlaceholderLabelLight,
                      { color: colors.outlineVariant },
                    ]}
                  >
                    + variant
                  </Text>
                </View>
              ) : (
                <>
                  <SetAttachmentChip attachment={set.attachment ?? null} />
                  <SetMountPositionChip mount={set.mount_position ?? null} />
                </>
              )}
            </Pressable>
            {/* BLD-2386 Item D3: gate pulley-pin chip behind variant selection.
                Show only after an attachment/mount is chosen — reduces chrome
                on unset rows. Keep symmetric with grip footer (BLD-822/823). */}
            {(showPulleyPin !== false) && pulleyPin !== undefined && (set.attachment != null || set.mount_position != null) ? (
              <Pressable
                onPress={() => onOpenPulleyPinPicker?.(set.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={pulleyPin != null ? `Pulley pin ${pulleyPin}, tap to change` : "Pulley pin not set, tap to set"}
              >
                <SetPulleyPinChip pin={pulleyPin} />
              </Pressable>
            ) : null}
          </View>
          {rpeStrip}
        </View>
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
        Both cable and grip footers now enumerate values in identical format
        (BLD-823). Keep both blocks in sync; do NOT diverge without updating
        both.
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
          <View style={styles.footerWithRpe}>
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
              style={[styles.variantFooter, styles.footerFlex]}
            >
              {gt == null && gw == null ? (
                <View
                  style={[
                    styles.variantPlaceholder,
                    // BLD-2386 Item D3: lighter visual weight — symmetric with cable footer.
                    // Stays mounted for a11y ref focus-restore (bodyweightGripFooterRef).
                    // accessibilityState={{ expanded }} N/A under D3 — no collapse/expand.
                    styles.variantPlaceholderLight,
                    { borderColor: colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.variantPlaceholderLabel,
                      styles.variantPlaceholderLabelLight,
                      { color: colors.outlineVariant },
                    ]}
                  >
                    + grip
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
            {rpeStrip}
          </View>
        );
      })() : null}

      {/*
        BLD-1110: Standalone RPE row for plain rows (no cable variant footer
        and no bodyweight-grip footer). Case C topology: main(48) +
        standalone-RPE-row(32) + PlateHint(~14) = ≤ 96 dp.
      */}
      {rpeStrip && !isCableExercise({ equipment })
        && !isBodyweightGripExercise({ equipment, name: exerciseName }) ? (
        <View style={styles.standaloneRpe}>{rpeStrip}</View>
      ) : null}

      {/*
        BLD-1158: Tempo chip — display-only. Self-suppresses when tempo is null
        (or for duration sets via the SetOptionsSheet gate). Long-press the set
        type indicator to open SetOptionsSheet → TempoEditorSheet.
        ⛔ NO haptics, NO streak/adherence/badge logic here (AC9 boundary).
      */}
      {set.tempo && trackingMode !== "duration" ? (
        <View style={styles.tempoRow}>
          <SetTempoChip tempo={set.tempo} />
        </View>
      ) : null}

      {ADVANCED_SET_TYPES.has(set.set_type) && onAddSegment && onDeleteSegment && onCollapseToNormal ? (
        <MiniSetEditor
          setId={set.id}
          segments={set.segments ?? []}
          onAddSegment={async () => {
            await onAddSegment(set.id, nextReps ?? 1);
            setNextReps(null);
          }}
          onDeleteSegment={(segId) => onDeleteSegment(segId, set.id)}
          onCollapseToNormal={() => onCollapseToNormal(set.id)}
          nextReps={nextReps}
          onChangeNextReps={setNextReps}
        />
      ) : null}

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
  // BLD-1110: outer wrapper that places variant/grip footer and RPE chips
  // side-by-side in a single row (footer-merge topology).
  footerWithRpe: {
    flexDirection: "row",
    alignItems: "center",
  },
  // BLD-1110: variant/grip footer takes flex so RPE chips stay right-aligned.
  footerFlex: {
    flex: 1,
  },
  footerChipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  // BLD-1110: standalone RPE row for plain rows (no variant/grip footer).
  standaloneRpe: {
    paddingLeft: 36,
    height: 32,
    justifyContent: "center",
  },
  // BLD-1158: tempo chip row — display-only, self-suppresses when tempo is null.
  tempoRow: {
    flexDirection: "row",
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
  // BLD-2386 Item D3: lighter variant for the unset-state pill (both null).
  // Reduces visual weight vs. the partial-state placeholders (which remain
  // at full weight because they signal a missing axis for a partially-set row).
  variantPlaceholderLight: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  variantPlaceholderLabelLight: {
    fontSize: fontSizes.xs,
    fontWeight: "400",
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
  videoGlyphBtn: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  setupPhotoThumb: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  durationCol: {
    flex: 1,
    marginHorizontal: 12,
  },
});
