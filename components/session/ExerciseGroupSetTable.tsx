/* eslint-disable max-lines-per-function */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SetRow } from "./SetRow";
import type { SetWithMeta, ExerciseGroup } from "./types";
import type { TrainingMode } from "../../lib/types";
import { fontSizes } from "@/constants/design-tokens";

export type ExerciseGroupSetTableProps = {
  group: ExerciseGroup;
  step: number;
  unit: "kg" | "lb";
  isDurationMode: boolean;
  showWarmupButton: boolean;
  colors: {
    onSurfaceVariant: string;
    primary: string;
    tertiary?: string;
  };
  onUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onAddSet: (exerciseId: string) => void;
  onAddWarmups: (exerciseId: string) => void;
  onCycleSetType: (setId: string) => void;
  onLongPressSetType: (setId: string) => void;
  onOpenBodyweightModifier?: (setId: string) => void;
  onClearBodyweightModifier?: (setId: string) => void;
  onOpenVariantPicker?: (setId: string, returnFocusHandle: number | null) => void;
  onClearVariant?: (setId: string) => void;
  onOpenBodyweightGripPicker?: (setId: string, returnFocusHandle: number | null) => void;
  onClearBodyweightGrip?: (setId: string) => void;
  timerActiveExerciseId?: string | null;
  timerActiveSetIndex?: number | null;
  timerIsRunning?: boolean;
  timerDisplaySeconds?: number;
  onTimerStart?: (setId: string) => void;
  onTimerStop?: (setId: string) => void;
};

export function ExerciseGroupSetTable({
  group, step, unit, isDurationMode, showWarmupButton, colors,
  onUpdate, onCheck, onDelete, onAddSet, onAddWarmups,
  onCycleSetType, onLongPressSetType,
  onOpenBodyweightModifier, onClearBodyweightModifier,
  onOpenVariantPicker, onClearVariant,
  onOpenBodyweightGripPicker, onClearBodyweightGrip,
  timerActiveExerciseId, timerActiveSetIndex, timerIsRunning, timerDisplaySeconds,
  onTimerStart, onTimerStop,
}: ExerciseGroupSetTableProps) {
  return (
    <>
      <View style={styles.headerRow}>
        <Text variant="caption" style={[styles.colSet, { color: colors.onSurfaceVariant }]}>SET</Text>
        <Text variant="caption" style={[styles.colPrev, { color: colors.onSurfaceVariant }]}>PREV</Text>
        <Text variant="caption" style={[styles.colLabel, { color: colors.onSurfaceVariant }]}>
          {group.is_bodyweight ? "LOAD" : (unit === "lb" ? "LB" : "KG")}
        </Text>
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
            trackingMode={isDurationMode ? "duration" : "reps"}
            equipment={group.equipment}
            onUpdate={onUpdate}
            onCheck={onCheck}
            onDelete={onDelete}
            onCycleSetType={onCycleSetType}
            onLongPressSetType={onLongPressSetType}
            isBodyweight={group.is_bodyweight}
            onOpenBodyweightModifier={onOpenBodyweightModifier}
            onClearBodyweightModifier={onClearBodyweightModifier}
            onOpenVariantPicker={onOpenVariantPicker}
            onClearVariant={onClearVariant}
            exerciseName={group.name}
            onOpenBodyweightGripPicker={onOpenBodyweightGripPicker}
            onClearBodyweightGrip={onClearBodyweightGrip}
            isTimerRunning={isActiveSet && (timerIsRunning ?? false)}
            isTimerActive={isActiveSet}
            timerDisplaySeconds={isActiveSet ? timerDisplaySeconds : undefined}
            onTimerStart={onTimerStart}
            onTimerStop={onTimerStop}
          />
        );
      })}
      <View style={styles.actionRow}>
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
        {showWarmupButton && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onAddWarmups(group.exercise_id)}
            style={styles.addSetBtn}
            accessibilityLabel={`Add warmup sets for ${group.name}`}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="fire" size={18} color={colors.tertiary ?? colors.primary} />
              <Text style={{ color: colors.tertiary ?? colors.primary, fontWeight: "600" }}>Add Warmups</Text>
            </View>
          </Button>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
    width: 80,
    textAlign: "center",
  },
  colLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSizes.xs,
    marginHorizontal: 12,
  },
  colTrailing: {
    width: 72,
  },
  addSetBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
});
