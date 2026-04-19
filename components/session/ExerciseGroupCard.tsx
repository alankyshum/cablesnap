/* eslint-disable max-lines-per-function, complexity */
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLayout } from "../../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { SetRow } from "./SetRow";
import { GroupCardHeader } from "./GroupCardHeader";
import { SuggestionChip } from "./SuggestionChip";
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
  halfStep: { setId: string; base: number } | null;
  linkIds: string[];
  groups: ExerciseGroup[];
  palette: string[];
  onUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onAddSet: (exerciseId: string) => void;
  onModeChange: (exerciseId: string, mode: TrainingMode) => void;
  onRPE: (set: SetWithMeta, val: number) => void;
  onHalfStep: (setId: string, val: number) => void;
  onHalfStepClear: () => void;
  onHalfStepOpen: (setId: string, base: number) => void;
  onExerciseNotes: (exerciseId: string, text: string) => void;
  onExerciseNotesDraftChange: (exerciseId: string, text: string) => void;
  onToggleExerciseNotes: (exerciseId: string) => void;
  onCycleSetType: (setId: string) => void;
  onLongPressSetType: (setId: string) => void;
  onShowDetail: (exerciseId: string) => void;
  onSwap: (exerciseId: string) => void;
  onDeleteExercise: (exerciseId: string) => void;
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
  exerciseNotesOpen, exerciseNotesDraft, halfStep, linkIds, groups, palette,
  onUpdate, onCheck, onDelete, onAddSet, onModeChange,
  onRPE, onHalfStep, onHalfStepClear,
  onHalfStepOpen, onExerciseNotes, onExerciseNotesDraftChange, onToggleExerciseNotes, onCycleSetType, onLongPressSetType,
  onShowDetail, onSwap, onDeleteExercise,
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

  const firstSet = group.sets[0];

  const isDurationMode = group.trackingMode === "duration";

  const setTable = (
    <>
      <View style={styles.headerRow}>
        <Text variant="caption" style={[styles.colSet, { color: colors.onSurfaceVariant }]}>SET</Text>
        <Text variant="caption" style={[styles.colPrev, { color: colors.onSurfaceVariant }]}>PREV</Text>
        <Text variant="caption" style={[styles.colLabel, { color: colors.onSurfaceVariant }]}>{unit === "lb" ? "LB" : "KG"}</Text>
        <Text variant="caption" style={[styles.colLabel, { color: colors.onSurfaceVariant }]}>{isDurationMode ? "DURATION" : "REPS"}</Text>
        <View style={styles.colTrailing} />
      </View>
      {group.sets.map((set, idx) => {
        const isActiveSet = timerActiveExerciseId === group.exercise_id && timerActiveSetIndex === idx;
        return (
          <SetRow
            key={set.id}
            set={set}
            step={step}
            unit={unit}
            halfStep={halfStep}
            trackingMode={isDurationMode ? "duration" : "reps"}
            onUpdate={onUpdate}
            onCheck={onCheck}
            onDelete={onDelete}
            onRPE={onRPE}
            onHalfStep={onHalfStep}
            onHalfStepClear={onHalfStepClear}
            onHalfStepOpen={onHalfStepOpen}
            onCycleSetType={onCycleSetType}
            onLongPressSetType={onLongPressSetType}
            isTimerRunning={isActiveSet && (timerIsRunning ?? false)}
            isTimerActive={isActiveSet}
            timerDisplaySeconds={isActiveSet ? timerDisplaySeconds : undefined}
            onTimerStart={onTimerStart}
            onTimerStop={onTimerStop}
          />
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        onPress={() => onAddSet(group.exercise_id)}
        style={styles.addSetBtn}
        accessibilityLabel={`Add set to ${group.name}`}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Add Set</Text>
        </View>
      </Button>
    </>
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
          modes={modes}
          exerciseNotesOpen={exerciseNotesOpen}
          exerciseNotesDraft={exerciseNotesDraft}
          firstSet={firstSet}
          onModeChange={onModeChange}
          onExerciseNotes={onExerciseNotes}
          onExerciseNotesDraftChange={onExerciseNotesDraftChange}
          onToggleExerciseNotes={onToggleExerciseNotes}
          onShowDetail={onShowDetail}
          onSwap={onSwap}
          onDeleteExercise={onDeleteExercise}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    minHeight: 28,
  },
  colSet: {
    width: 36,
    textAlign: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  colPrev: {
    width: 64,
    textAlign: "center",
  },
  colLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    marginHorizontal: 12,
  },
  colTrailing: {
    width: 72,
  },
  addSetBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  divider: {
    marginTop: 8,
    marginBottom: 12,
  },
  linkGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
    borderRadius: 4,
  },
});
