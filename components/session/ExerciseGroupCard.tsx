/* eslint-disable max-lines-per-function, complexity */
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useLayout } from "../../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { GroupCardHeader } from "./GroupCardHeader";
import { SuggestionChip } from "./SuggestionChip";
import { ExerciseGroupSetTable } from "./ExerciseGroupSetTable";
import type { SetWithMeta, ExerciseGroup } from "./types";
import type { TrainingMode } from "../../lib/types";
import type { Suggestion } from "../../lib/rm";

export type GroupCardProps = {
  group: ExerciseGroup;
  step: number;
  unit: "kg" | "lb";
  suggestions: Record<string, Suggestion | null>;
  modes: Record<string, TrainingMode>;
  exerciseNotesOpen: boolean;
  exerciseNotesDraft: string | undefined;
  linkIds: string[];
  groups: ExerciseGroup[];
  palette: string[];
  onUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onAddSet: (exerciseId: string) => void;
  onAddWarmups: (exerciseId: string) => void;
  onModeChange: (exerciseId: string, mode: TrainingMode) => void;
  onExerciseNotes: (exerciseId: string, text: string) => void;
  onExerciseNotesDraftChange: (exerciseId: string, text: string) => void;
  onToggleExerciseNotes: (exerciseId: string) => void;
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
  // Timer
  timerActiveExerciseId?: string | null;
  timerActiveSetIndex?: number | null;
  timerIsRunning?: boolean;
  timerDisplaySeconds?: number;
  onTimerStart?: (setId: string) => void;
  onTimerStop?: (setId: string) => void;
};

export const ExerciseGroupCard = memo(function ExerciseGroupCard({
  group, step, unit, suggestions, modes,
  exerciseNotesOpen, exerciseNotesDraft, linkIds, groups, palette,
  onUpdate, onCheck, onDelete, onAddSet, onAddWarmups, onModeChange,
  onExerciseNotes, onExerciseNotesDraftChange, onToggleExerciseNotes, onCycleSetType, onLongPressSetType,
  onOpenBodyweightModifier, onClearBodyweightModifier,
  onOpenVariantPicker, onClearVariant,
  onOpenBodyweightGripPicker, onClearBodyweightGrip,
  onShowDetail, onSwap, onDeleteExercise,
  onMoveUp, onMoveDown,
  onPrefill,
  timerActiveExerciseId, timerActiveSetIndex, timerIsRunning, timerDisplaySeconds,
  onTimerStart, onTimerStop,
}: GroupCardProps) {
  const colors = useThemeColors();
  const layout = useLayout();
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
    />
  );

  const suggestionChip = suggestion ? (
    <SuggestionChip
      suggestion={suggestion}
      sets={group.sets}
      step={step}
      onUpdate={onUpdate}
      colors={colors}
    />
  ) : null;

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
          currentMode={modes[group.exercise_id]}
          exerciseNotesOpen={exerciseNotesOpen}
          exerciseNotesDraft={exerciseNotesDraft}
          firstSet={firstSet}
          previousPerformance={group.previousSummary}
          previousPerformanceA11y={group.previousSummaryA11y}
          onModeChange={onModeChange}
          onExerciseNotes={onExerciseNotes}
          onExerciseNotesDraftChange={onExerciseNotesDraftChange}
          onToggleExerciseNotes={onToggleExerciseNotes}
          onShowDetail={onShowDetail}
          onSwap={onSwap}
          onDeleteExercise={onDeleteExercise}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onPrefill={onPrefill}
          isFirst={isFirstReorderable}
          isLast={isLastReorderable}
          showMoveButtons={showMoveButtons}
        />
        {layout.atLeastMedium ? (
          <View style={styles.groupWideRow}>
            {suggestionChip && (
              <View style={styles.groupInfoCol}>
                {suggestionChip}
              </View>
            )}
            <View style={suggestionChip ? styles.groupSetsCol : { flex: 1 }}>
              {setTable}
            </View>
          </View>
        ) : (
          <>
            {suggestionChip}
            {setTable}
          </>
        )}
      </View>
      <Separator style={styles.divider} />
    </View>
  );
});

const styles = StyleSheet.create({
  group: {
    marginBottom: 8,
  },
  groupWideRow: {
    flexDirection: "row",
    gap: 16,
  },
  groupInfoCol: {
    flex: 2,
    minWidth: 160,
  },
  groupSetsCol: {
    flex: 3,
  },
  divider: { marginTop: 8, marginBottom: 12 },
  linkGroupHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4, borderRadius: 4 },
});
