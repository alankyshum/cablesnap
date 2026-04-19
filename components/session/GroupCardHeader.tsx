/* eslint-disable max-lines-per-function */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import TrainingModeSelector from "../../components/TrainingModeSelector";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ExerciseNotesPanel } from "./ExerciseNotesPanel";
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

export function GroupCardHeader({ group, modes, exerciseNotesOpen, exerciseNotesDraft, firstSet, onModeChange, onExerciseNotes, onExerciseNotesDraftChange, onToggleExerciseNotes, onShowDetail, onSwap, onDeleteExercise }: GroupCardHeaderProps) {
  const colors = useThemeColors();
  const notesValue = exerciseNotesDraft ?? firstSet?.notes ?? "";
  const eid = group.exercise_id;

  return (
    <>
      <View style={styles.headerWrap}>
        <View style={styles.headerRow1}>
          <Pressable onLongPress={() => onDeleteExercise(eid)} delayLongPress={500} style={{ flex: 1, flexShrink: 1 }} accessibilityLabel={`Remove ${group.name}`} accessibilityRole="button" accessibilityHint="Long press to remove exercise">
            <Text variant="title" style={[styles.groupTitle, { color: colors.primary }]}>{group.name}</Text>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable onPress={() => onSwap(eid)} accessibilityLabel={`Swap ${group.name}`} hitSlop={8} style={styles.iconBtn}>
              <MaterialCommunityIcons name="swap-horizontal" size={24} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable onPress={() => onToggleExerciseNotes(eid)} accessibilityLabel={`${group.name} notes`} hitSlop={8} style={styles.iconBtn}>
              <MaterialCommunityIcons name={firstSet?.notes ? "note-text" : "note-text-outline"} size={24} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        </View>
        <View style={styles.headerRow2}>
          <Button variant="ghost" size="sm" onPress={() => onShowDetail(eid)} accessibilityLabel={`View ${group.name} details`} style={styles.detailsBtn}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="information-outline" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Details</Text>
            </View>
          </Button>
          {group.is_voltra && group.training_modes.length > 1 && (
            <TrainingModeSelector modes={group.training_modes} selected={modes[eid] ?? group.training_modes[0]} exercise={group.name} onSelect={(m) => onModeChange(eid, m)} compact />
          )}
        </View>
      </View>
      {exerciseNotesOpen && <ExerciseNotesPanel exerciseId={eid} value={notesValue} onDraftChange={onExerciseNotesDraftChange} onSave={onExerciseNotes} />}
    </>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 4, marginBottom: 8 },
  headerRow1: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerRow2: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  headerActions: { flexDirection: "row", alignItems: "center" },
  groupTitle: { fontWeight: "700" },
  iconBtn: { padding: 8 },
  detailsBtn: { marginLeft: -12, marginRight: -8 },
});
