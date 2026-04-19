/* eslint-disable max-lines-per-function */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import TrainingModeSelector from "../../components/TrainingModeSelector";
import { useLayout } from "../../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { SetWithMeta, ExerciseGroup } from "./types";
import type { TrainingMode } from "../../lib/types";

export type GroupCardHeaderProps = {
  group: ExerciseGroup;
  modes: Record<string, TrainingMode>;
  exerciseNotesOpen: boolean;
  exerciseNotesDraft: string | undefined;
  firstSet: SetWithMeta | undefined;
  onModeChange: (exerciseId: string, mode: TrainingMode) => void;
  onExerciseNotes: (exerciseId: string, text: string) => void;
  onExerciseNotesDraftChange: (exerciseId: string, text: string) => void;
  onToggleExerciseNotes: (exerciseId: string) => void;
  onShowDetail: (exerciseId: string) => void;
  onSwap: (exerciseId: string) => void;
  onDeleteExercise: (exerciseId: string) => void;
};

export function GroupCardHeader({
  group,
  modes,
  exerciseNotesOpen,
  exerciseNotesDraft,
  firstSet,
  onModeChange,
  onExerciseNotes,
  onExerciseNotesDraftChange,
  onToggleExerciseNotes,
  onShowDetail,
  onSwap,
  onDeleteExercise,
}: GroupCardHeaderProps) {
  const colors = useThemeColors();
  const layout = useLayout();

  const exerciseNotesValue = exerciseNotesDraft ?? firstSet?.notes ?? "";

  return (
    <>
      {layout.compact ? (
        <View style={styles.groupHeaderCompactWrap}>
          <View style={styles.groupHeaderCompactRow}>
            <Pressable
              onLongPress={() => onDeleteExercise(group.exercise_id)}
              delayLongPress={500}
              style={{ flex: 1 }}
              accessibilityLabel={`Remove ${group.name}`}
              accessibilityRole="button"
              accessibilityHint="Long press to remove exercise"
            >
              <Text
                variant="title"
                numberOfLines={2}
                ellipsizeMode="tail"
                style={[styles.groupTitle, { color: colors.primary }]}
              >
                {group.name}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onSwap(group.exercise_id)}
              accessibilityLabel={`Swap ${group.name} for alternative`}
              hitSlop={8}
              style={[styles.swapBtn, { padding: 8 }]}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={24} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable
              onPress={() => onToggleExerciseNotes(group.exercise_id)}
              accessibilityLabel={`${group.name} notes`}
              hitSlop={8}
              style={[styles.notesBtn, { padding: 8 }]}
            >
              <MaterialCommunityIcons name={firstSet?.notes ? "note-text" : "note-text-outline"} size={24} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <View style={styles.groupHeaderCompactRow}>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => onShowDetail(group.exercise_id)}
              accessibilityLabel={`View ${group.name} details`}
              style={styles.detailsBtn}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="information-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Details</Text>
              </View>
            </Button>
            {group.is_voltra && group.training_modes.length > 1 && (
              <TrainingModeSelector
                modes={group.training_modes}
                selected={modes[group.exercise_id] ?? group.training_modes[0]}
                exercise={group.name}
                onSelect={(m) => onModeChange(group.exercise_id, m)}
                compact
              />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.groupHeader}>
          <Pressable
            onLongPress={() => onDeleteExercise(group.exercise_id)}
            delayLongPress={500}
            style={{ flex: 1 }}
            accessibilityLabel={`Remove ${group.name}`}
            accessibilityRole="button"
            accessibilityHint="Long press to remove exercise"
          >
            <Text
              variant="title"
              numberOfLines={2}
              ellipsizeMode="tail"
              style={[styles.groupTitle, { color: colors.primary }]}
            >
              {group.name}
            </Text>
          </Pressable>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onShowDetail(group.exercise_id)}
            accessibilityLabel={`View ${group.name} details`}
            style={styles.detailsBtn}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="information-outline" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Details</Text>
            </View>
          </Button>
          <Pressable
            onPress={() => onSwap(group.exercise_id)}
            accessibilityLabel={`Swap ${group.name} for alternative`}
            hitSlop={8}
            style={[styles.swapBtn, { padding: 8 }]}
          >
            <MaterialCommunityIcons name="swap-horizontal" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
          <Pressable
            onPress={() => onToggleExerciseNotes(group.exercise_id)}
            accessibilityLabel={`${group.name} notes`}
            hitSlop={8}
            style={[styles.notesBtn, { padding: 8 }]}
          >
            <MaterialCommunityIcons name={firstSet?.notes ? "note-text" : "note-text-outline"} size={24} color={colors.onSurfaceVariant} />
          </Pressable>
          {group.is_voltra && group.training_modes.length > 1 && (
            <TrainingModeSelector
              modes={group.training_modes}
              selected={modes[group.exercise_id] ?? group.training_modes[0]}
              exercise={group.name}
              onSelect={(m) => onModeChange(group.exercise_id, m)}
              compact
            />
          )}
        </View>
      )}
      {exerciseNotesOpen && (
        <View style={styles.notesContainer}>
          <Input
            placeholder="Add exercise notes..."
            value={exerciseNotesValue}
            onChangeText={(v) => onExerciseNotesDraftChange(group.exercise_id, v)}
            onBlur={() => onExerciseNotes(group.exercise_id, exerciseNotesValue)}
            maxLength={200}
            multiline
            style={styles.notesInput}
            accessibilityLabel="Exercise notes"
          />
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "right", fontSize: 12 }}>
            {exerciseNotesValue.length}/200
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  groupTitle: {
    fontWeight: "700",
    flex: 1,
    minWidth: 80,
  },
  groupHeaderCompactWrap: {
    gap: 4,
    marginBottom: 8,
  },
  groupHeaderCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  swapBtn: {
    width: 56,
    height: 56,
    margin: 0,
  },
  notesBtn: {
    width: 56,
    height: 56,
    margin: 0,
  },
  detailsBtn: {
    marginLeft: -12,
    marginRight: -8,
  },
  notesContainer: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 4,
  },
  notesInput: {
    fontSize: 14,
    minHeight: 48,
  },
});
