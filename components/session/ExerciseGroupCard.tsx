/* eslint-disable max-lines-per-function, complexity */
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { GroupCardHeader } from "./GroupCardHeader";
import { ExerciseGroupSetTable } from "./ExerciseGroupSetTable";
import type { SetWithMeta, ExerciseGroup } from "./types";
import type { Suggestion } from "../../lib/rm";
import type { BreakThroughSuggestion } from "../../lib/plateau";
import { useActiveCalibration } from "@/hooks/useActiveCalibration";

export type GroupCardProps = {
  group: ExerciseGroup;
  step: number;
  unit: "kg" | "lb";
  suggestions: Record<string, Suggestion | null>;
  exerciseNotesOpen: boolean;
  exerciseNotesDraft: string | undefined;
  /** BLD-1028 */
  pinnedNoteDraft?: string;
  linkIds: string[];
  groups: ExerciseGroup[];
  palette: string[];
  onUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onAddSet: (exerciseId: string) => void;
  onAddWarmups: (exerciseId: string) => void;
  onExerciseNotes: (exerciseId: string, text: string) => void;
  onExerciseNotesDraftChange: (exerciseId: string, text: string) => void;
  onToggleExerciseNotes: (exerciseId: string) => void;
  /** BLD-1028 */
  onPinnedNoteDraftChange: (exerciseId: string, text: string) => void;
  onPinnedNoteSave: (exerciseId: string, text: string) => void;
  onBackfillCopy: (exerciseId: string, text: string) => void;
  onBackfillDismiss: (exerciseId: string) => void;
  onLoadBackfill: (exerciseId: string) => void;
  onCycleSetType: (setId: string) => void;
  onLongPressSetType: (setId: string) => void;
  // BLD-541 bodyweight modifier wiring (forwarded to SetRow when group is_bodyweight)
  onOpenBodyweightModifier?: (setId: string) => void;
  onClearBodyweightModifier?: (setId: string) => void;
  // BLD-771 cable variant wiring (forwarded to SetRow; SetRow self-gates on
  // isCableExercise(equipment) so passing for non-cable groups is a no-op).
  onOpenVariantPicker?: (setId: string, returnFocusHandle: number | null) => void;
  onClearVariant?: (setId: string) => void;
  // BLD-822: bodyweight grip variant wiring (forwarded to SetRow; gated by
  // isBodyweightGripExercise({equipment, name}); hook-local ref isolates focus
  // state from cable variant picker per QD-10).
  onOpenBodyweightGripPicker?: (setId: string, returnFocusHandle: number | null) => void;
  onClearBodyweightGrip?: (setId: string) => void;
  onShowDetail: (exerciseId: string) => void;
  onSwap: (exerciseId: string) => void;
  onDeleteExercise: (exerciseId: string) => void;
  onMoveUp?: (exerciseId: string) => void;
  onMoveDown?: (exerciseId: string) => void;
  onPrefill?: (exerciseId: string) => void;
  /** BLD-1122: per-exercise plateau break-through hints */
  plateauHints?: Record<string, BreakThroughSuggestion | null>;
  /** BLD-1122: atomic apply callback */
  onApplyBreakThrough?: (exerciseId: string, updates: { id: string; weight: number | null; reps: number | null }[]) => Promise<void>;
  // Timer
  timerActiveExerciseId?: string | null;
  timerActiveSetIndex?: number | null;
  timerIsRunning?: boolean;
  timerDisplaySeconds?: number;
  onTimerStart?: (setId: string) => void;
  onTimerStop?: (setId: string) => void;
  // BLD-1092: form-check video glyph
  hasClipMap?: Record<string, boolean>;
  onVideoGlyph?: (setId: string) => void;
  onOpenPulleyPinPicker?: (setId: string) => void;
  showPulleyPin?: boolean;
  hasSetupPhotoMap?: Record<string, boolean>;
  setupPhotoUriMap?: Record<string, string>;
  onSetupPhotoGlyph?: (setId: string) => void;
  // BLD-1110: live RPE capture
  captureRpe?: boolean;
  onRpeChange?: (setId: string, rpe: number | null) => void;
  // BLD-1126: Stack Marker Quick-Pick
  gymId?: string | null;
  onMarkerConfirm?: (setId: string, result: { stackId: string; stackName: string; marker: number; trueWeight: number; unit: string }) => void;
  onManualWeightSave?: (setId: string, weight: number | null, reps: number | null) => void;
  /** BLD-1175: Mini-set segment handlers. */
  onAddSegment?: (setId: string) => Promise<void> | void;
  onDeleteSegment?: (segmentId: string, setId: string) => Promise<void> | void;
  onCollapseToNormal?: (setId: string) => Promise<void> | void;
};

export const ExerciseGroupCard = memo(function ExerciseGroupCard({
  group, step, unit, suggestions,
  exerciseNotesOpen, exerciseNotesDraft, pinnedNoteDraft, linkIds, groups, palette,
  onUpdate, onCheck, onDelete, onAddSet, onAddWarmups,
  onExerciseNotes, onExerciseNotesDraftChange, onToggleExerciseNotes,
  onPinnedNoteDraftChange, onPinnedNoteSave, onBackfillCopy, onBackfillDismiss, onLoadBackfill,
  onCycleSetType, onLongPressSetType,
  onOpenBodyweightModifier, onClearBodyweightModifier,
  onOpenVariantPicker, onClearVariant,
  onOpenBodyweightGripPicker, onClearBodyweightGrip,
  onShowDetail, onSwap, onDeleteExercise,
  onMoveUp, onMoveDown,
  onPrefill, plateauHints, onApplyBreakThrough,
  timerActiveExerciseId, timerActiveSetIndex, timerIsRunning, timerDisplaySeconds,
  onTimerStart, onTimerStop,
  hasClipMap, onVideoGlyph,
  onOpenPulleyPinPicker, showPulleyPin, hasSetupPhotoMap, setupPhotoUriMap, onSetupPhotoGlyph,
  captureRpe, onRpeChange,
  gymId, onMarkerConfirm, onManualWeightSave,
  onAddSegment, onDeleteSegment, onCollapseToNormal,
}: GroupCardProps) {
  const colors = useThemeColors();
  // BLD-1130 G3: lift `useActiveCalibration` out of `SetRow` (it was previously
  // called per-row, forcing a global jest mock to keep tests rendering and
  // multiplying query overhead by row count). Now fetched once per
  // `ExerciseGroupCard` and prop-drilled to every SetRow as `stacks`.
  // The hook is unconditional but `useQuery({ enabled: !!gymId })` no-ops when
  // `gymId` is null/undefined, returning [].
  const stacks = useActiveCalibration(gymId ?? null);
  const linked = group.link_id ? groups.filter((g) => g.link_id === group.link_id) : [];
  const linkIdx = group.link_id ? linked.findIndex((g) => g.exercise_id === group.exercise_id) : -1;
  const isFirstInLink = linkIdx === 0;
  const totalRounds = group.link_id ? Math.max(...linked.map((g) => g.sets.length)) : 0;
  const completedRounds = group.link_id
    ? Math.min(...linked.map((g) => g.sets.filter((s) => s.completed).length))
    : 0;
  const groupColorIdx = group.link_id ? linkIds.indexOf(group.link_id) : -1;
  const groupColor = groupColorIdx >= 0 ? palette[groupColorIdx % palette.length] : undefined;
  const suggestion = suggestions[group.exercise_id];
  // Reorder: only for non-superset exercises, ≥2 reorderable groups
  const reorderableGroups = groups.filter((g) => !g.link_id);
  const reorderIdx = group.link_id ? -1 : reorderableGroups.findIndex((g) => g.exercise_id === group.exercise_id);
  const showMoveButtons = !group.link_id && reorderableGroups.length >= 2;
  const isFirstReorderable = reorderIdx === 0;
  const isLastReorderable = reorderIdx === reorderableGroups.length - 1;
  const hasExistingWarmups = group.sets.some((s) => s.set_type === "warmup");
  const showWarmupButton = !group.is_bodyweight && suggestion != null && suggestion.weight > 0 && !hasExistingWarmups;
  const firstSet = group.sets[0];
  const isDurationMode = group.trackingMode === "duration";

  const setTable = (
    <ExerciseGroupSetTable
      group={group}
      step={step}
      unit={unit}
      isDurationMode={isDurationMode}
      showWarmupButton={showWarmupButton}
      colors={colors}
      onUpdate={onUpdate}
      onCheck={onCheck}
      onDelete={onDelete}
      onAddSet={onAddSet}
      onAddWarmups={onAddWarmups}
      onCycleSetType={onCycleSetType}
      onLongPressSetType={onLongPressSetType}
      onOpenBodyweightModifier={onOpenBodyweightModifier}
      onClearBodyweightModifier={onClearBodyweightModifier}
      onOpenVariantPicker={onOpenVariantPicker}
      onClearVariant={onClearVariant}
      onOpenBodyweightGripPicker={onOpenBodyweightGripPicker}
      onClearBodyweightGrip={onClearBodyweightGrip}
      timerActiveExerciseId={timerActiveExerciseId}
      timerActiveSetIndex={timerActiveSetIndex}
      timerIsRunning={timerIsRunning}
      timerDisplaySeconds={timerDisplaySeconds}
      onTimerStart={onTimerStart}
      onTimerStop={onTimerStop}
      hasClipMap={hasClipMap}
      onVideoGlyph={onVideoGlyph}
      onOpenPulleyPinPicker={onOpenPulleyPinPicker}
      showPulleyPin={showPulleyPin}
      hasSetupPhotoMap={hasSetupPhotoMap}
      setupPhotoUriMap={setupPhotoUriMap}
      onSetupPhotoGlyph={onSetupPhotoGlyph}
      captureRpe={captureRpe}
      onRpeChange={onRpeChange}
      gymId={gymId}
      stacks={stacks}
      onMarkerConfirm={onMarkerConfirm}
      onManualWeightSave={onManualWeightSave}
      onAddSegment={onAddSegment}
      onDeleteSegment={onDeleteSegment}
      onCollapseToNormal={onCollapseToNormal}
    />
  );

  return (
    <View style={styles.group}>
      {isFirstInLink && group.link_id && (
        <View
          style={[styles.linkGroupHeader, { borderLeftColor: groupColor, borderLeftWidth: 4 }]}
          accessibilityRole="header"
          accessibilityLabel={`Round ${completedRounds + 1} of ${totalRounds}`}
        >
          <Text variant="caption" style={{ color: groupColor, fontWeight: "700" }}>
            {linked.length >= 3 ? "Circuit" : "Superset"} — Round {completedRounds + 1}/{totalRounds}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}>
            Rest after round
          </Text>
        </View>
      )}

      <View style={group.link_id ? { borderLeftWidth: 4, borderLeftColor: groupColor, paddingLeft: 8 } : undefined}>
        <GroupCardHeader
          group={group}
          exerciseNotesOpen={exerciseNotesOpen}
          exerciseNotesDraft={exerciseNotesDraft}
          pinnedNoteDraft={pinnedNoteDraft}
          firstSet={firstSet}
          previousPerformance={group.previousSummary}
          previousPerformanceA11y={group.previousSummaryA11y}
          previousSetupPhotoUri={group.previousSetupPhotoUri}
          suggestion={suggestion}
          step={step}
          onUpdate={onUpdate}
          onExerciseNotes={onExerciseNotes}
          onExerciseNotesDraftChange={onExerciseNotesDraftChange}
          onToggleExerciseNotes={onToggleExerciseNotes}
          onPinnedNoteDraftChange={onPinnedNoteDraftChange}
          onPinnedNoteSave={onPinnedNoteSave}
          onBackfillCopy={onBackfillCopy}
          onBackfillDismiss={onBackfillDismiss}
          onLoadBackfill={onLoadBackfill}
          onShowDetail={onShowDetail}
          onSwap={onSwap}
          onDeleteExercise={onDeleteExercise}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onPrefill={onPrefill}
          plateauHint={plateauHints?.[group.exercise_id]}
          onApplyBreakThrough={onApplyBreakThrough}
          unit={unit}
          isFirst={isFirstReorderable}
          isLast={isLastReorderable}
          showMoveButtons={showMoveButtons}
        />
        {/* BLD-850: removed tablet 2-col split (regression of BLD-716) — set
            table renders full-width on every breakpoint. */}
        {setTable}
      </View>
      <Separator style={styles.divider} />
    </View>
  );
});

const styles = StyleSheet.create({
  group: {
    marginBottom: 8,
  },
  divider: { marginTop: 8, marginBottom: 12 },
  linkGroupHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4, borderRadius: 4 },
});
