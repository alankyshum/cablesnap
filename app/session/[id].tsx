import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/bna-toast";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import BottomSheet, { BottomSheetFlatList, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { play as playAudio, setEnabled as setAudioEnabled } from "../../lib/audio";
import {
  addSet,
  addSetsBatch,
  cancelSession,
  deleteSet,
  deleteSetsBatch,
  completeSession,
  completeSet,
  getBodySettings,
  getAllExercises,
  getMaxWeightByExercise,
  getRecentExerciseSets,
  getSessionById,
  getSessionSets,
  getSourceSessionSets,
  getTemplateById,
  getPreviousSets,
  getRestSecondsForExercise,
  getRestSecondsForLink,
  swapExerciseInSession,
  undoSwapInSession,
  uncompleteSet,
  updateSet,
  updateSetsBatch,
  updateSetRPE,
  updateSetNotes,
  updateSetTrainingMode,
  updateSetType,
  getExerciseById,
  getAppSetting,
  setAppSetting,
} from "../../lib/db";
import {
  getSessionProgramDayId,
  getProgramDayById,
  advanceProgram,
} from "../../lib/programs";
import type { WorkoutSession, WorkoutSet, TrainingMode, Exercise, SetType } from "../../lib/types";
import { CATEGORY_LABELS, ATTACHMENT_LABELS, SET_TYPE_CYCLE, SET_TYPE_LABELS } from "../../lib/types";
import { rpeColor, rpeText } from "../../lib/rpe";
import { difficultyText, DIFFICULTY_COLORS } from "../../constants/theme";
import { MuscleMap } from "../../components/MuscleMap";
import { useProfileGender } from "../../lib/useProfileGender";
import { suggest, epley, type Suggestion } from "../../lib/rm";
import TrainingModeSelector from "../../components/TrainingModeSelector";
import { formatTime } from "../../lib/format";
import { useLayout } from "../../lib/layout";
import { confirmAction } from "../../lib/confirm";
import WeightPicker from "../../components/WeightPicker";
import ExercisePickerSheet from "../../components/ExercisePickerSheet";
import SubstitutionSheet from "../../components/SubstitutionSheet";
import { radii, duration as durationTokens } from "../../constants/design-tokens";
import { uuid } from "../../lib/uuid";
import { useThemeColors } from "@/hooks/useThemeColors";

type SetWithMeta = WorkoutSet & {
  exercise_name?: string;
  exercise_deleted?: boolean;
  previous?: string;
};

type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithMeta[];
  link_id: string | null;
  training_modes: TrainingMode[];
  is_voltra: boolean;
};

const RPE_CHIPS = [6, 7, 8, 9, 10] as const;

const RPE_LABELS: Record<number, string> = {
  6: "Easy", 7: "Easy", 8: "Mod", 9: "Hard", 10: "Max",
};

type SetRowProps = {
  set: SetWithMeta;
  step: number;
  unit: "kg" | "lb";
  halfStep: { setId: string; base: number } | null;
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onRPE: (set: SetWithMeta, val: number) => void;
  onHalfStep: (setId: string, val: number) => void;
  onHalfStepClear: () => void;
  onHalfStepOpen: (setId: string, base: number) => void;
  onCycleSetType: (setId: string) => void;
  onLongPressSetType: (setId: string) => void;
};

const SetRow = memo(function SetRow({
  set, step, unit, halfStep,
  onUpdate, onCheck, onDelete, onRPE, onHalfStep, onHalfStepClear,
  onHalfStepOpen, onCycleSetType, onLongPressSetType,
}: SetRowProps) {
  const colors = useThemeColors();

  const onWeightChange = useCallback((v: number) => onUpdate(set.id, "weight", String(v)), [set.id, onUpdate]);
  const onRepsChange = useCallback((v: number) => onUpdate(set.id, "reps", String(v)), [set.id, onUpdate]);

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

  return (
    <View>
        <View
          style={[
            styles.setRow,
            set.completed && { backgroundColor: colors.primaryContainer + "40" },
            { backgroundColor: colors.background },
            borderColor ? { borderLeftWidth: 3, borderLeftColor: borderColor } : undefined,
          ]}
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
                <Text style={{ color: chipStyle!.fg, fontSize: 13, fontWeight: "700" }}>{chipLabel}</Text>
              </View>
            ) : (
              <Text variant="body" style={{ color: colors.onSurface, textAlign: "center" }}>
                {set.round ? `R${set.round}` : set.set_number}
              </Text>
            )}
          </Pressable>
          <Text variant="caption" style={[styles.colPrev, { color: colors.onSurfaceVariant }]}>
            {set.previous}
          </Text>
          <View style={styles.pickerCol}>
            <WeightPicker
              value={set.weight}
              step={step}
              unit={unit}
              onValueChange={onWeightChange}
              accessibilityLabel={`Set ${set.set_number} weight`}
            />
          </View>
          <View style={styles.pickerCol}>
            <WeightPicker
              value={set.reps}
              step={1}
              onValueChange={onRepsChange}
              accessibilityLabel={`Set ${set.set_number} reps`}
              max={999}
            />
          </View>
          <Pressable
            onPress={() => onCheck(set)}
            hitSlop={6}
            style={[
              styles.circleCheck,
              { borderColor: set.completed ? colors.primary : colors.onSurfaceVariant },
              set.completed && { backgroundColor: colors.primary },
            ]}
            accessibilityLabel={`Mark set ${set.set_number} ${set.completed ? "incomplete" : "complete"}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: set.completed }}
          >
            {set.completed && (
              <MaterialCommunityIcons name="check" size={18} color={colors.onPrimary} />
            )}
          </Pressable>
          <Pressable
            onPress={() => onDelete(set.id)}
            hitSlop={6}
            style={styles.actionBtn}
            accessibilityLabel={`Delete set ${set.set_number}`}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="delete-outline" size={22} color={colors.error} />
          </Pressable>
        </View>

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
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginRight: 8, fontSize: 12 }}>
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
            <Text style={{ color: rpeText(set.rpe), fontSize: 12, fontWeight: "600" }}>
              RPE {set.rpe}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

type GroupCardProps = {
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
  onUpdate: (setId: string, field: "weight" | "reps", val: string) => void;
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
};

const ExerciseGroupCard = memo(function ExerciseGroupCard({
  group, step, unit, suggestions, modes,
  exerciseNotesOpen, exerciseNotesDraft, halfStep, linkIds, groups, palette,
  onUpdate, onCheck, onDelete, onAddSet, onModeChange,
  onRPE, onHalfStep, onHalfStepClear,
  onHalfStepOpen, onExerciseNotes, onExerciseNotesDraftChange, onToggleExerciseNotes, onCycleSetType, onLongPressSetType,
  onShowDetail, onSwap, onDeleteExercise,
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

  // Exercise-level notes: use first set's notes as the exercise note
  const firstSet = group.sets[0];
  const exerciseNotesValue = exerciseNotesDraft ?? firstSet?.notes ?? "";

  const suggestionChip = suggestion && (() => {
    const s = suggestion;
    const isIncrease = s.type === "increase" || s.type === "rep_increase";
    const label = s.type === "rep_increase"
      ? `${s.reps} reps ▲`
      : s.type === "increase"
        ? `${s.weight} ▲`
        : `${s.weight} =`;
    const hint = s.type === "rep_increase"
      ? `Suggested reps: ${s.reps}, ${s.reason}`
      : s.type === "increase"
        ? `Suggested weight: ${s.weight}, increase by ${step}`
        : `Suggested weight: ${s.weight}, maintain`;
    return (
      <Pressable
        onPress={() => {
          if (s.type === "rep_increase") {
            for (const set of group.sets) {
              if (!set.completed && (set.reps == null || set.reps === 0)) {
                onUpdate(set.id, "reps", String(s.reps));
              }
            }
          } else {
            for (const set of group.sets) {
              if (!set.completed && (set.weight == null || set.weight === 0)) {
                onUpdate(set.id, "weight", String(s.weight));
              }
            }
          }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={[
          styles.suggestionChip,
          { backgroundColor: isIncrease ? colors.primaryContainer : colors.surfaceVariant },
        ]}
        accessibilityRole="button"
        accessibilityLabel={hint}
        accessibilityHint={s.type === "rep_increase" ? "Double tap to fill suggested reps" : "Double tap to fill suggested weight"}
      >
        <Text
          variant="caption"
          style={{
            color: isIncrease ? colors.onPrimaryContainer : colors.onSurfaceVariant,
            fontWeight: "600",
          }}
        >
          Suggested: {label}
        </Text>
      </Pressable>
    );
  })();

  const exerciseInfo = (
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

  const setTable = (
    <>
      <View style={styles.headerRow}>
        <Text variant="caption" style={[styles.colSet, { color: colors.onSurfaceVariant }]}>SET</Text>
        <Text variant="caption" style={[styles.colPrev, { color: colors.onSurfaceVariant }]}>PREV</Text>
        <Text variant="caption" style={[styles.colLabel, { color: colors.onSurfaceVariant }]}>{unit === "lb" ? "LB" : "KG"}</Text>
        <Text variant="caption" style={[styles.colLabel, { color: colors.onSurfaceVariant }]}>REPS</Text>
        <View style={styles.colTrailing} />
      </View>
      {group.sets.map((set) => (
        <SetRow
          key={set.id}
          set={set}
          step={step}
          unit={unit}
          halfStep={halfStep}
          onUpdate={onUpdate}
          onCheck={onCheck}
          onDelete={onDelete}
          onRPE={onRPE}
          onHalfStep={onHalfStep}
          onHalfStepClear={onHalfStepClear}
          onHalfStepOpen={onHalfStepOpen}
          onCycleSetType={onCycleSetType}
          onLongPressSetType={onLongPressSetType}
        />
      ))}
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
        {exerciseInfo}
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

function ExerciseDetailDrawerContent({ exercise }: { exercise: Exercise }) {
  const colors = useThemeColors();
  const layout = useLayout();
  const profileGender = useProfileGender();
  const { width: screenWidth } = useWindowDimensions();

  const steps = exercise.instructions
    ?.split("\n")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

  const musclesAndMeta = (
    <>
      <View style={styles.detailChips}>
        <View style={[styles.detailBadge, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[styles.detailBadgeText, { color: colors.onPrimaryContainer }]}>
            {CATEGORY_LABELS[exercise.category]}
          </Text>
        </View>
        <View style={[styles.detailBadge, { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] }]}>
          <Text style={[styles.detailBadgeText, { color: difficultyText(exercise.difficulty), fontWeight: "600" }]}>
            {exercise.difficulty}
          </Text>
        </View>
        <View style={[styles.detailBadge, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[styles.detailBadgeText, { color: colors.onSurfaceVariant }]}>
            {exercise.equipment}
          </Text>
        </View>
      </View>
      {exercise.mount_position && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
            Mount Position
          </Text>
          <Text variant="body" style={{ color: colors.onSurface, marginTop: 2 }}>
            {exercise.mount_position}
          </Text>
        </View>
      )}
      {exercise.attachment && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
            Attachment
          </Text>
          <Text variant="body" style={{ color: colors.onSurface, marginTop: 2 }}>
            {ATTACHMENT_LABELS[exercise.attachment]}
          </Text>
        </View>
      )}
      {exercise.primary_muscles.length > 0 && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
            Primary Muscles
          </Text>
          <View style={styles.detailChips}>
            {exercise.primary_muscles.map((m) => (
              <View key={m} style={[styles.detailBadge, { backgroundColor: colors.secondaryContainer }]}>
                <Text style={[styles.detailBadgeText, { color: colors.onSecondaryContainer }]}>{m}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {exercise.secondary_muscles.length > 0 && (
        <View style={styles.detailSection}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
            Secondary Muscles
          </Text>
          <View style={styles.detailChips}>
            {exercise.secondary_muscles.map((m) => (
              <View key={m} style={[styles.detailBadge, { backgroundColor: colors.tertiaryContainer }]}>
                <Text style={[styles.detailBadgeText, { color: colors.onTertiaryContainer }]}>{m}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );

  const instructions = steps.length > 0 ? (
    <View style={styles.detailSection}>
      <Text variant="body" style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
        Instructions
      </Text>
      {steps.map((step, i) => (
        <Text key={i} variant="body" style={{ color: colors.onSurface, marginTop: 6, lineHeight: 22 }}>
          {step}
        </Text>
      ))}
    </View>
  ) : null;

  const mapWidth = layout.atLeastMedium
    ? Math.min(screenWidth - 64, 600)
    : screenWidth - 48;

  return (
    <BottomSheetFlatList
      data={[]}
      renderItem={null}
      style={styles.detailBody}
      contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={
        <>
          {layout.atLeastMedium ? (
            <>
              <View style={styles.detailRow}>
                <View style={styles.detailColLeft}>
                  {musclesAndMeta}
                </View>
                <View style={styles.detailColRight}>
                  {instructions}
                </View>
              </View>
              <MuscleMap
                primary={exercise.primary_muscles}
                secondary={exercise.secondary_muscles}
                width={mapWidth}
                gender={profileGender}
              />
            </>
          ) : (
            <>
              {musclesAndMeta}
              {instructions}
            </>
          )}
        </>
      }
    />
  );
}

export default function ActiveSession() {
  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {
      // Wake Lock unavailable on web without secure context — non-critical
    });
  }, []);
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const { id, templateId, sourceSessionId } = useLocalSearchParams<{
    id: string;
    templateId?: string;
    sourceSessionId?: string;
  }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialized = useRef(false);
  const [rest, setRest] = useState(0);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [maxes, setMaxes] = useState<Record<string, number>>({});
  const prevExerciseIds = useRef<string>("");
  const prHapticFired = useRef<Set<string>>(new Set());
  const { info: showToast, error: showError, warning: showWarning } = useToast();
  const [exerciseNotesOpen, setExerciseNotesOpen] = useState<Record<string, boolean>>({});
  const [exerciseNotesDraft, setExerciseNotesDraft] = useState<Record<string, string>>({});
  const [halfStep, setHalfStep] = useState<{ setId: string; base: number } | null>(null);
  const [nextHint, setNextHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [step, setStep] = useState(2.5);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const restFlash = useSharedValue(0);
  const restFlashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      restFlash.value,
      [0, 1],
      [colors.primaryContainer, colors.primary],
    ),
  }));
  const restHapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Load timer sound setting
  useEffect(() => {
    getAppSetting("timer_sound_enabled").then((val) => {
      setAudioEnabled(val !== "false")
    }).catch(() => {
      setAudioEnabled(true)
      showError("Could not load sound setting")
    })
  }, []);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion | null>>({});
  const [modes, setModes] = useState<Record<string, TrainingMode>>({});
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const detailSheetRef = useRef<BottomSheet>(null);
  const detailSnapPoints = useMemo(() => ["40%", "90%"], []);

  // Substitution state
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [swapSource, setSwapSource] = useState<Exercise | null>(null);
  const swapSheetRef = useRef<BottomSheet>(null);
  const swapUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.link_id && !ids.includes(g.link_id)) ids.push(g.link_id);
    }
    return ids;
  }, [groups]);

  const palette = useMemo(
    () => [colors.tertiary, colors.secondary, colors.primary, colors.error, colors.inversePrimary],
    [colors],
  );

  const load = useCallback(async () => {
    if (!id) return;
    const sess = await getSessionById(id);
    if (!sess) return;
    setSession(sess);

    if (sess.completed_at) {
      router.replace(`/session/detail/${id}`);
      return;
    }

    const sets = await getSessionSets(id);

    // Fetch weight step from body settings
    const body = await getBodySettings();
    const derived = body.weight_unit === "lb" ? 5 : 2.5;
    setStep(derived);
    setUnit(body.weight_unit);

    const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];

    // Parallel fetch: previous sets, exercise metadata, and suggestions data
    const [prevResults, exerciseResults, recentResults] = await Promise.all([
      Promise.all(exerciseIds.map(async (eid) => ({ eid, data: await getPreviousSets(eid, id) }))),
      Promise.all(exerciseIds.map(async (eid) => ({ eid, data: await getExerciseById(eid) }))),
      Promise.all(exerciseIds.map(async (eid) => ({ eid, data: await getRecentExerciseSets(eid, 2) }))),
    ]);

    const prevCache: Record<string, { set_number: number; weight: number | null; reps: number | null }[]> = {};
    for (const { eid, data } of prevResults) prevCache[eid] = data;

    const exerciseMeta: Record<string, Exercise> = {};
    for (const { eid, data } of exerciseResults) {
      if (data) exerciseMeta[eid] = data;
    }

    // Fetch historical maxes for PR detection (only when exercise list changes)
    const key = exerciseIds.sort().join(",");
    if (key !== prevExerciseIds.current) {
      prevExerciseIds.current = key;
      const m = await getMaxWeightByExercise(exerciseIds, id);
      setMaxes(m);
    }

    // Group by exercise
    const map = new Map<string, ExerciseGroup>();
    for (const s of sets) {
      if (!map.has(s.exercise_id)) {
        const ex = exerciseMeta[s.exercise_id];
        const parsed: TrainingMode[] = ex?.training_modes ?? [];
        map.set(s.exercise_id, {
          exercise_id: s.exercise_id,
          name: (s.exercise_name ?? "Unknown") + (s.exercise_deleted ? " (removed)" : ""),
          sets: [],
          link_id: s.link_id ?? null,
          training_modes: parsed,
          is_voltra: ex?.is_voltra ?? false,
        });
      }
      const prev = prevCache[s.exercise_id]?.find(
        (p) => p.set_number === s.set_number
      );
      map.get(s.exercise_id)!.sets.push({
        ...s,
        previous:
          prev && prev.weight != null && prev.reps != null
            ? prev.weight > 0 && prev.reps > 1
              ? `${prev.weight}×${prev.reps} (1RM: ${Math.round(epley(prev.weight, prev.reps))})`
              : `${prev.weight}×${prev.reps}`
            : "-",
      });
    }
    setGroups([...map.values()]);

    // Compute progressive overload suggestions using already-fetched data
    const entries: [string, Suggestion | null][] = exerciseIds.map((eid) => {
      try {
        const recent = recentResults.find((r) => r.eid === eid)?.data ?? [];
        if (recent.length === 0) return [eid, null];
        const timeBased = recent.every((r) => r.reps === 1 && (r.weight === 0 || r.weight === null));
        if (timeBased) return [eid, null];
        const ex = exerciseMeta[eid];
        const bw = ex ? ex.equipment === "bodyweight" : false;
        return [eid, suggest(recent, derived, bw)];
      } catch {
        return [eid, null];
      }
    });
    const sugg: Record<string, Suggestion | null> = Object.fromEntries(entries);
    setSuggestions(sugg);
  }, [id, router]);

  // Initialize session from template
  useEffect(() => {
    if (initialized.current || !id) return;
    initialized.current = true;

    (async () => {
      const sets = await getSessionSets(id);
      if (sets.length > 0) {
        await load();
        return;
      }

      if (templateId) {
        const tpl = await getTemplateById(templateId);
        if (tpl?.exercises) {
          const setsToInsert: Parameters<typeof addSetsBatch>[0] = [];
          for (const te of tpl.exercises) {
            for (let i = 1; i <= te.target_sets; i++) {
              setsToInsert.push({
                sessionId: id,
                exerciseId: te.exercise_id,
                setNumber: i,
                linkId: te.link_id ?? null,
                round: te.link_id ? i : null,
              });
            }
          }
          await addSetsBatch(setsToInsert);

          const created = await getSessionSets(id);
          const exerciseIds = [...new Set(created.map((s) => s.exercise_id))];
          const prevCache: Record<string, { set_number: number; weight: number | null; reps: number | null }[]> = {};
          const prevResults = await Promise.all(
            exerciseIds.map(async (eid) => ({ eid, data: await getPreviousSets(eid, id) }))
          );
          for (const { eid, data } of prevResults) prevCache[eid] = data;

          const setsToUpdate: { id: string; weight: number | null; reps: number | null }[] = [];
          for (const s of created) {
            const prev = prevCache[s.exercise_id]?.find((p) => p.set_number === s.set_number);
            if (prev && prev.weight != null) {
              setsToUpdate.push({ id: s.id, weight: prev.weight, reps: null });
            }
          }
          await updateSetsBatch(setsToUpdate);
        }
      } else if (sourceSessionId) {
        const sourceSets = await getSourceSessionSets(sourceSessionId);

        // Detect deleted exercises
        const deletedExerciseIds = new Set<string>();
        const validSets = sourceSets.filter((s) => {
          if (!s.exercise_exists) {
            deletedExerciseIds.add(s.exercise_id);
            return false;
          }
          return true;
        });

        if (deletedExerciseIds.size > 0) {
          showWarning(
            `${deletedExerciseIds.size} exercise${deletedExerciseIds.size > 1 ? "s were" : " was"} skipped (no longer available)`
          );
        }

        if (validSets.length > 0) {
          // Map old link_ids to new UUIDs
          const linkIdMap = new Map<string, string>();
          for (const s of validSets) {
            if (s.link_id && !linkIdMap.has(s.link_id)) {
              linkIdMap.set(s.link_id, uuid());
            }
          }

          const setsToInsert: Parameters<typeof addSetsBatch>[0] = [];
          for (const s of validSets) {
            const newLinkId = s.link_id ? linkIdMap.get(s.link_id) ?? null : null;
            setsToInsert.push({
              sessionId: id,
              exerciseId: s.exercise_id,
              setNumber: s.set_number,
              linkId: newLinkId,
              round: newLinkId ? s.set_number : null,
              trainingMode: (s.training_mode as TrainingMode) ?? null,
              tempo: s.tempo ?? null,
              isWarmup: s.is_warmup,
              setType: s.set_type,
            });
          }
          const created = await addSetsBatch(setsToInsert);

          // Pre-fill weights and reps from source session
          const setsToUpdate: { id: string; weight: number | null; reps: number | null }[] = [];
          for (let i = 0; i < created.length; i++) {
            const source = validSets[i];
            if (source && (source.weight != null || source.reps != null)) {
              setsToUpdate.push({
                id: created[i].id,
                weight: source.weight,
                reps: source.reps,
              });
            }
          }
          await updateSetsBatch(setsToUpdate);
        }
      }
      await load();
    })();
  }, [id, templateId, sourceSessionId, load]);

  // Reload exercises when returning from exercise picker
  useFocusEffect(
    useCallback(() => {
      if (initialized.current && id) {
        load();
      }
      // Load all exercises for substitution sheet
      getAllExercises().then(setAllExercises).catch((err) => {
        if (__DEV__) console.warn("Failed to load exercises for substitution:", err);
      });
    }, [id, load])
  );

  // Timer
  useEffect(() => {
    if (!session) return;
    const update = () => {
      setElapsed(Math.floor((Date.now() - session.started_at) / 1000));
    };
    update();
    timer.current = setInterval(update, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [session]);

  const updateGroupSet = useCallback((setId: string, patch: Partial<SetWithMeta>) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }))
    );
  }, []);

  const handleUpdate = useCallback(async (
    setId: string,
    field: "weight" | "reps",
    val: string
  ) => {
    let resolvedSet: SetWithMeta | undefined;
    setGroups((prev) => {
      for (const g of prev) {
        const s = g.sets.find((s) => s.id === setId);
        if (s) { resolvedSet = s; break; }
      }
      return prev;
    });
    if (!resolvedSet) return;

    const num = val === "" ? null : parseFloat(val);
    if (field === "weight") {
      updateGroupSet(setId, { weight: num });
      await updateSet(setId, num, resolvedSet.reps);
    } else {
      const rounded = num !== null ? Math.round(num) : null;
      updateGroupSet(setId, { reps: rounded });
      await updateSet(setId, resolvedSet.weight, rounded);
    }
  }, [updateGroupSet]);

  const startRest = useCallback(async (exerciseId: string) => {
    if (restRef.current) clearInterval(restRef.current);
    const secs = await getRestSecondsForExercise(id!, exerciseId);
    setRest(secs);
    restRef.current = setInterval(() => {
      setRest((prev) => {
        if (prev <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          restRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [id]);

  const startRestWithDuration = useCallback((secs: number) => {
    if (restRef.current) clearInterval(restRef.current);
    setRest(secs);
    restRef.current = setInterval(() => {
      setRest((prev) => {
        if (prev <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          restRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const dismissRest = useCallback(() => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    setRest(0);
  }, []);

  const prevRest = useRef(0);
  useEffect(() => {
    if (prevRest.current > 0 && rest === 0) {
      // Triple-burst haptic pattern
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const t1 = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 300);
      const t2 = setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }, 600);
      restHapticTimers.current = [t1, t2];

      // Audio cue — rest complete
      playAudio("complete");

      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = 1;
      // eslint-disable-next-line react-hooks/immutability
      restFlash.value = withTiming(0, { duration: durationTokens.slow });
    }

    // Audio cue — 3-2-1 countdown tick
    if (rest > 0 && rest <= 3) {
      playAudio("tick");
    }

    prevRest.current = rest;
  }, [rest, restFlash]);

  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      for (const t of restHapticTimers.current) clearTimeout(t);
      if (swapUndoTimer.current) clearTimeout(swapUndoTimer.current);
      if (deleteExerciseTimer.current) clearTimeout(deleteExerciseTimer.current);
      if (deleteCountdownInterval.current) clearInterval(deleteCountdownInterval.current);
    };
  }, []);

  const handleCheck = useCallback(async (set: SetWithMeta) => {
    if (set.completed) {
      updateGroupSet(set.id, { completed: false, completed_at: null });
      await uncompleteSet(set.id);
    } else {
      const now = Date.now();
      updateGroupSet(set.id, { completed: true, completed_at: now });
      await completeSet(set.id);

      if (set.link_id) {
        const linked = groups.filter((g) => g.link_id === set.link_id);
        const idx = linked.findIndex((g) => g.exercise_id === set.exercise_id);
        const next = idx >= 0 && idx < linked.length - 1 ? linked[idx + 1] : null;

        if (next) {
          setNextHint(`Next: ${next.name}`);
          AccessibilityInfo.announceForAccessibility(`Next: ${next.name}`);
          if (hintTimer.current) clearTimeout(hintTimer.current);
          hintTimer.current = setTimeout(() => setNextHint(null), 1500);
        } else {
          setNextHint(null);
          const secs = await getRestSecondsForLink(id!, set.link_id);
          startRestWithDuration(secs);
        }
      } else {
        startRest(set.exercise_id);
      }
    }
  }, [updateGroupSet, groups, id, startRest, startRestWithDuration]);

  const handleAddSet = useCallback(async (exerciseId: string) => {
    const group = groups.find((g) => g.exercise_id === exerciseId);
    const num = (group?.sets.length ?? 0) + 1;
    const fallback = group?.is_voltra && group.training_modes.length > 1 ? group.training_modes[0] : null;
    const mode = modes[exerciseId] ?? fallback;
    const newSet = await addSet(id!, exerciseId, num, null, null, mode, null);
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise_id === exerciseId
          ? { ...g, sets: [...g.sets, { ...newSet, previous: "-" }] }
          : g
      )
    );
  }, [id, groups, modes]);

  const handleModeChange = useCallback(async (exerciseId: string, mode: TrainingMode) => {
    setModes((prev) => ({ ...prev, [exerciseId]: mode }));
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise_id === exerciseId
          ? { ...g, sets: g.sets.map((s) => (s.completed ? s : { ...s, training_mode: mode })) }
          : g
      )
    );
    for (const set of group.sets) {
      if (!set.completed) {
        await updateSetTrainingMode(set.id, mode);
      }
    }
  }, [groups]);

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAddExercise = () => {
    setPickerOpen(true);
  };

  const handleShowDetail = useCallback(async (exerciseId: string) => {
    const ex = await getExerciseById(exerciseId);
    setDetailExercise(ex);
    detailSheetRef.current?.snapToIndex(0);
  }, []);

  const handleSwapOpen = useCallback(async (exerciseId: string) => {
    // Check if all sets are completed
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (group && group.sets.every((s) => s.completed)) {
      showWarning("All sets completed — nothing to swap");
      return;
    }
    const ex = await getExerciseById(exerciseId);
    if (!ex) return;
    setSwapSource(ex);
    swapSheetRef.current?.snapToIndex(0);
  }, [groups]);

  const swapUndoRef = useRef<{ setIds: string[]; originalExerciseId: string } | null>(null);

  const handleSwapUndo = useCallback(async () => {
    if (!swapUndoRef.current) return;
    try {
      await undoSwapInSession(swapUndoRef.current.setIds, swapUndoRef.current.originalExerciseId);
      swapUndoRef.current = null;
      if (swapUndoTimer.current) {
        clearTimeout(swapUndoTimer.current);
        swapUndoTimer.current = null;
      }
      await load();
    } catch {
      showError("Failed to undo swap");
    }
  }, [load]);

  const handleSwapSelect = useCallback(async (newExercise: Exercise) => {
    if (!id || !swapSource) return;
    try {
      const modifiedIds = await swapExerciseInSession(id, swapSource.id, newExercise.id);
      if (modifiedIds.length === 0) {
        showWarning("All sets completed — nothing to swap");
        setSwapSource(null);
        return;
      }
      const originalId = swapSource.id;
      setSwapSource(null);
      await load();

      // Start rest timer with new exercise rest seconds
      startRest(newExercise.id);

      // Store undo info in ref for the snackbar action
      swapUndoRef.current = { setIds: modifiedIds, originalExerciseId: originalId };

      // Undo snackbar (5s)
      if (swapUndoTimer.current) clearTimeout(swapUndoTimer.current);
      showToast(`Swapped to ${newExercise.name}`, { action: { label: "Undo", onPress: handleSwapUndo } });
      swapUndoTimer.current = setTimeout(() => {
        swapUndoTimer.current = null;
        swapUndoRef.current = null;
      }, 5000);
    } catch {
      showError("Failed to swap exercise");
    }
  }, [id, swapSource, load, startRest, handleSwapUndo]);

  const handlePickExercise = useCallback(async (exercise: { id: string }) => {
    if (!id) return;
    setPickerOpen(false);
    for (let i = 1; i <= 3; i++) {
      await addSet(id, exercise.id, i);
    }
    await load();
  }, [id, load]);

  // --- Long-press exercise delete with countdown ---
  const deleteExerciseRef = useRef<{ exerciseId: string; setIds: string[]; removedGroup: ExerciseGroup; originalIndex: number } | null>(null);
  const deleteExerciseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteCountdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Commit a pending delete immediately (used when a second delete starts before first finishes)
  const commitPendingDelete = useCallback(async () => {
    if (!deleteExerciseRef.current) return;
    const { setIds } = deleteExerciseRef.current;
    deleteExerciseRef.current = null;
    if (deleteExerciseTimer.current) {
      clearTimeout(deleteExerciseTimer.current);
      deleteExerciseTimer.current = null;
    }
    if (deleteCountdownInterval.current) {
      clearInterval(deleteCountdownInterval.current);
      deleteCountdownInterval.current = null;
    }
    try {
      await deleteSetsBatch(setIds);
    } catch {
      // Best-effort: pending delete failed but UI already moved on
    }
  }, []);

  const handleDeleteExerciseUndo = useCallback(() => {
    if (!deleteExerciseRef.current) return;
    const { removedGroup, originalIndex } = deleteExerciseRef.current;
    setGroups((prev) => {
      const exists = prev.some((g) => g.exercise_id === removedGroup.exercise_id);
      if (exists) return prev;
      // Restore at original position
      const next = [...prev];
      next.splice(Math.min(originalIndex, next.length), 0, removedGroup);
      return next;
    });
    deleteExerciseRef.current = null;
    if (deleteExerciseTimer.current) {
      clearTimeout(deleteExerciseTimer.current);
      deleteExerciseTimer.current = null;
    }
    if (deleteCountdownInterval.current) {
      clearInterval(deleteCountdownInterval.current);
      deleteCountdownInterval.current = null;
    }

  }, []);

  const handleDeleteExercise = useCallback((exerciseId: string) => {
    const groupIndex = groups.findIndex((g) => g.exercise_id === exerciseId);
    if (groupIndex === -1) return;
    const group = groups[groupIndex];

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const setIds = group.sets.map((s) => s.id);

    // Commit any pending delete before starting a new one (prevents UI/DB desync)
    commitPendingDelete();

    // Optimistically remove the group from UI
    setGroups((prev) => prev.filter((g) => g.exercise_id !== exerciseId));

    // Clear rest timer if it was running for this exercise
    dismissRest();

    // Store undo info with original position for correct restore
    deleteExerciseRef.current = { exerciseId, setIds, removedGroup: group, originalIndex: groupIndex };

    // Start 5s countdown
    let remaining = 5;
    showToast(`Removing ${group.name}... (5s)`, { action: { label: "UNDO", onPress: handleDeleteExerciseUndo } });

    deleteCountdownInterval.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (deleteCountdownInterval.current) {
          clearInterval(deleteCountdownInterval.current);
          deleteCountdownInterval.current = null;
        }
      } else {
        showToast(`Removing ${group.name}... (${remaining}s)`);
      }
    }, 1000);

    deleteExerciseTimer.current = setTimeout(async () => {
      deleteExerciseTimer.current = null;
      deleteExerciseRef.current = null;
      if (deleteCountdownInterval.current) {
        clearInterval(deleteCountdownInterval.current);
        deleteCountdownInterval.current = null;
      }
      // Actually delete from DB
      try {
        await deleteSetsBatch(setIds);
      } catch {
        // Restore group on DB failure
        setGroups((prev) => {
          const exists = prev.some((g) => g.exercise_id === group.exercise_id);
          if (exists) return prev;
          const next = [...prev];
          next.splice(Math.min(groupIndex, next.length), 0, group as ExerciseGroup);
          return next;
        });
        showError('Failed to delete exercise. Restored.');
      }
    }, 5000);
  }, [groups, dismissRest, handleDeleteExerciseUndo, commitPendingDelete]);

  const handleRPE = useCallback(async (set: SetWithMeta, val: number) => {
    const next = set.rpe === val ? null : val;
    updateGroupSet(set.id, { rpe: next });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateSetRPE(set.id, next);
  }, [updateGroupSet]);

  const handleHalfStep = useCallback(async (setId: string, val: number) => {
    updateGroupSet(setId, { rpe: val });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHalfStep(null);
    await updateSetRPE(setId, val);
  }, [updateGroupSet]);

  const handleDelete = useCallback(async (setId: string) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.filter((s) => s.id !== setId)
          .map((s, i) => ({ ...s, set_number: i + 1 })),
      })).filter((g) => g.sets.length > 0)
    );
    await deleteSet(setId);
  }, []);

  const handleHalfStepClear = useCallback(() => setHalfStep(null), []);

  const handleHalfStepOpen = useCallback((setId: string, base: number) => {
    setHalfStep({ setId, base });
  }, []);

  const handleExerciseNotes = useCallback(async (exerciseId: string, text: string) => {
    // Save notes to the first set of this exercise group
    const group = groups.find((g) => g.exercise_id === exerciseId);
    if (!group || group.sets.length === 0) return;
    const firstSetId = group.sets[0].id;
    updateGroupSet(firstSetId, { notes: text });
    setExerciseNotesDraft((prev) => { const next = { ...prev }; delete next[exerciseId]; return next; });
    await updateSetNotes(firstSetId, text);
  }, [updateGroupSet, groups]);

  const handleExerciseNotesDraftChange = useCallback((exerciseId: string, text: string) => {
    setExerciseNotesDraft((prev) => ({ ...prev, [exerciseId]: text }));
  }, []);

  const toggleExerciseNotes = useCallback((exerciseId: string) => {
    setExerciseNotesOpen((prev) => ({ ...prev, [exerciseId]: !prev[exerciseId] }));
  }, []);

  const handleCycleSetType = useCallback(async (setId: string) => {
    let newType = "normal" as SetType;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.map((s) => {
          if (s.id === setId) {
            const idx = SET_TYPE_CYCLE.indexOf(s.set_type);
            newType = SET_TYPE_CYCLE[(idx + 1) % SET_TYPE_CYCLE.length];
            return { ...s, set_type: newType, is_warmup: newType === "warmup" };
          }
          return s;
        }),
      }))
    );
    await updateSetType(setId, newType);
    Haptics.selectionAsync();

    // First-use tooltip for non-warmup types
    if (newType === "dropset" || newType === "failure") {
      const shown = await getAppSetting("set_type_tooltip_shown");
      if (!shown) {
        showToast("Dropsets count toward volume. Failure sets help track intensity.");
        await setAppSetting("set_type_tooltip_shown", "1");
      }
    }
    // Keep warmup first-use tooltip as well
    if (newType === "warmup") {
      const shown = await getAppSetting("warmup_tooltip_shown");
      if (!shown) {
        showToast("Set marked as warm-up. Warm-up sets are excluded from volume and PR tracking.");
        await setAppSetting("warmup_tooltip_shown", "1");
      }
    }
  }, []);

  const [setTypeSheetSetId, setSetTypeSheetSetId] = useState<string | null>(null);

  const handleLongPressSetType = useCallback((setId: string) => {
    Haptics.selectionAsync();
    setSetTypeSheetSetId(setId);
  }, []);

  const handleSelectSetType = useCallback(async (type: SetType) => {
    const setId = setTypeSheetSetId;
    if (!setId) return;
    setSetTypeSheetSetId(null);
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.map((s) => {
          if (s.id === setId) {
            return { ...s, set_type: type, is_warmup: type === "warmup" };
          }
          return s;
        }),
      }))
    );
    await updateSetType(setId, type);
    Haptics.selectionAsync();
  }, [setTypeSheetSetId]);

  const isPR = (set: SetWithMeta) => {
    if (!set.completed || !set.weight || set.weight <= 0) return false;
    const max = maxes[set.exercise_id];
    if (max === undefined) return false;
    return set.weight > max;
  };

  // Haptic feedback on new PR detection
  useEffect(() => {
    for (const g of groups) {
      for (const s of g.sets) {
        if (isPR(s) && !prHapticFired.current.has(s.id)) {
          prHapticFired.current.add(s.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        if (!isPR(s) && prHapticFired.current.has(s.id)) {
          prHapticFired.current.delete(s.id);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, maxes]);

  const finish = () => {
    confirmAction(
      "Complete Workout?",
      `Duration: ${formatTime(elapsed)}`,
      async () => {
        await completeSession(id!);

        // Strava sync (non-blocking — never prevents workout completion)
        try {
          const { syncSessionToStrava } = await import("../../lib/strava");
          const synced = await syncSessionToStrava(id!);
          if (synced) {
            showToast("Synced to Strava ✓");
          }
        } catch {
          showError("Strava sync failed");
        }

        // Health Connect sync (non-blocking, silent — no toast on success or failure)
        if (Platform.OS === "android") {
          try {
            const { syncToHealthConnect } = await import("../../lib/health-connect");
            await syncToHealthConnect(id!);
          } catch {
            // HC sync is silent — failures logged to sync table for retry
          }
        }

        try {
          const dayId = await getSessionProgramDayId(id!);
          if (dayId) {
            const day = await getProgramDayById(dayId);
            if (day) {
              const result = await advanceProgram(day.program_id, dayId, id!);
              if (result.wrapped) {
                showToast(`Cycle ${result.cycle} complete!`);
                AccessibilityInfo.announceForAccessibility(
                  `Cycle ${result.cycle} complete! Program wrapping to day 1.`
                );
                await new Promise((r) => setTimeout(r, 1500));
              } else {
                AccessibilityInfo.announceForAccessibility(
                  "Workout complete. Program advanced to next day."
                );
              }
            }
          }
        } catch {
          // Program advance failed — session is already saved, navigate normally
        }

        const allSets = await getSessionSets(id!);
        const done = allSets.filter((s) => s.completed);
        if (done.length === 0) {
          router.replace("/(tabs)");
        } else {
          router.replace(`/session/summary/${id}`);
        }
      },
      false
    );
  };

  const cancel = () => {
    confirmAction(
      "Discard Workout?",
      "All logged sets will be lost.",
      async () => {
        await cancelSession(id!);
        router.back();
      },
      true
    );
  };

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Workout" }} />
        <View
          style={[
            styles.center,
            { backgroundColor: colors.background },
          ]}
        >
          <Text style={{ color: colors.onSurfaceVariant }}>
            Loading...
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                variant="body"
                style={{ color: colors.primary, marginRight: 8 }}
              >
                {formatTime(elapsed)}
              </Text>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <FlashList
        data={groups}
        renderItem={({ item: group }) => (
          <ExerciseGroupCard
            group={group}
            step={step}
            unit={unit}
            suggestions={suggestions}
            modes={modes}
            exerciseNotesOpen={!!exerciseNotesOpen[group.exercise_id]}
            exerciseNotesDraft={exerciseNotesDraft[group.exercise_id]}
            halfStep={halfStep}
            linkIds={linkIds}
            groups={groups}
            palette={palette}
            onUpdate={handleUpdate}
            onCheck={handleCheck}
            onDelete={handleDelete}
            onAddSet={handleAddSet}
            onModeChange={handleModeChange}
            onRPE={handleRPE}
            onHalfStep={handleHalfStep}
            onHalfStepClear={handleHalfStepClear}
            onHalfStepOpen={handleHalfStepOpen}
            onExerciseNotes={handleExerciseNotes}
            onExerciseNotesDraftChange={handleExerciseNotesDraftChange}
            onToggleExerciseNotes={toggleExerciseNotes}
            onCycleSetType={handleCycleSetType}
            onLongPressSetType={handleLongPressSetType}
            onShowDetail={handleShowDetail}
            onSwap={handleSwapOpen}
            onDeleteExercise={handleDeleteExercise}
          />
        )}
        keyExtractor={(item) => item.exercise_id}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {rest > 0 && (
              <Reanimated.View
                style={[styles.restBanner, restFlashStyle]}
                accessibilityLiveRegion="polite"
              >
                <Text variant="heading" style={{ color: colors.onPrimaryContainer, fontWeight: "700" }} accessibilityLabel={`Rest timer: ${Math.floor(rest / 60)} minutes ${rest % 60} seconds`}>
                  {String(Math.floor(rest / 60)).padStart(2, "0")}:{String(rest % 60).padStart(2, "0")}
                </Text>
                <Text variant="caption" style={{ color: colors.onPrimaryContainer, marginTop: 4 }}>
                  Rest Timer
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={dismissRest}
                  textStyle={{ color: colors.onPrimaryContainer }}
                  style={{ marginTop: 4 }}
                  accessibilityLabel="Skip rest timer"
                  label="Skip"
                />
              </Reanimated.View>
            )}
            {nextHint && (
              <View style={[styles.nextBanner, { backgroundColor: colors.secondaryContainer }]} accessibilityLiveRegion="polite">
                <Text variant="subtitle" style={{ color: colors.onSecondaryContainer, fontWeight: "700" }}>
                  {nextHint}
                </Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          <>
            <Button
              variant="outline"
              onPress={handleAddExercise}
              style={styles.addExercise}
              accessibilityLabel="Add exercise to workout"
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Add Exercise</Text>
              </View>
            </Button>
            <Button
              variant="default"
              onPress={finish}
              style={styles.finishBtn}
              accessibilityLabel="Finish workout"
              label="Finish Workout"
            />
            <Button
              variant="ghost"
              onPress={cancel}
              textStyle={{ color: colors.error }}
              style={styles.cancelBtn}
              accessibilityLabel="Cancel workout"
              label="Cancel Workout"
            />
          </>
        }
      />
      </KeyboardAvoidingView>
      {!!setTypeSheetSetId && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.setTypeOverlay]}
          onPress={() => setSetTypeSheetSetId(null)}
        >
          <View style={[styles.setTypeSheet, { backgroundColor: colors.surface }]}>
            <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
              Set Type
            </Text>
            {SET_TYPE_CYCLE.map((type) => {
              const label = SET_TYPE_LABELS[type];
              const isSelected = (() => {
                if (!setTypeSheetSetId) return false;
                for (const g of groups) {
                  for (const s of g.sets) {
                    if (s.id === setTypeSheetSetId) return s.set_type === type;
                  }
                }
                return false;
              })();
              return (
                <Pressable
                  key={type}
                  style={[
                    styles.setTypeOption,
                    { backgroundColor: isSelected ? colors.primaryContainer : "transparent" },
                  ]}
                  onPress={() => handleSelectSetType(type)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label.label} set`}
                  accessibilityState={{ selected: isSelected }}
                >
                  {label.short ? (
                    <View style={[styles.setTypeChipPreview, {
                      backgroundColor: type === "warmup" ? colors.surfaceVariant
                        : type === "dropset" ? colors.tertiaryContainer
                        : type === "failure" ? colors.errorContainer
                        : colors.surfaceDisabled,
                    }]}>
                      <Text style={{
                        fontSize: 13, fontWeight: "700",
                        color: type === "warmup" ? colors.onSurfaceVariant
                          : type === "dropset" ? colors.onTertiaryContainer
                          : colors.onErrorContainer,
                      }}>{label.short}</Text>
                    </View>
                  ) : (
                    <View style={[styles.setTypeChipPreview, { backgroundColor: colors.surfaceDisabled }]}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>—</Text>
                    </View>
                  )}
                  <Text variant="body" style={{ color: colors.onSurface, marginLeft: 12 }}>
                    {label.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      )}

      <ExercisePickerSheet
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        onPick={handlePickExercise}
      />
      <BottomSheet
        ref={detailSheetRef}
        index={-1}
        snapPoints={detailSnapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        onClose={() => setDetailExercise(null)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        )}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
      >
        {detailExercise && (
          <>
            <View style={styles.detailHeader}>
              <Text variant="title" style={{ color: colors.onSurface, flex: 1 }}>
                {detailExercise.name}
              </Text>
              <Pressable
                onPress={() => detailSheetRef.current?.close()}
                accessibilityLabel="Close exercise details"
                hitSlop={8}
                style={{ padding: 8 }}
              >
                <MaterialCommunityIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
            <ExerciseDetailDrawerContent exercise={detailExercise} />
          </>
        )}
      </BottomSheet>
      <SubstitutionSheet
        sheetRef={swapSheetRef}
        sourceExercise={swapSource}
        allExercises={allExercises}
        onSelect={handleSwapSelect}
        onDismiss={() => setSwapSource(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
    flexWrap: "wrap",
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    minHeight: 28,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    marginBottom: 2,
  },
  colSet: {
    width: 36,
    textAlign: "center",
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
  colPrev: {
    width: 64,
    textAlign: "center",
  },
  pickerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  colLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    marginHorizontal: 12,
  },
  colCheck: {
    width: 32,
    alignItems: "center",
  },
  colTrailing: {
    width: 72,
  },
  circleCheck: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  prChipText: {
    fontSize: 12,
  },
  modeBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  addSetBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
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
  divider: {
    marginTop: 8,
    marginBottom: 12,
  },
  addExercise: {
    marginTop: 8,
  },
  finishBtn: {
    marginTop: 24,
  },
  actionContent: {
    paddingVertical: 8,
  },
  cancelBtn: {
    marginTop: 8,
  },
  restBanner: {
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  nextBanner: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 44,
    alignItems: "center",
  },
  rpeChipText: {
    fontSize: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
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
  notesContainer: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 4,
  },
  notesInput: {
    fontSize: 14,
    minHeight: 48,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginLeft: 4,
    marginBottom: 6,
    minHeight: 48,
    justifyContent: "center",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  detailBody: {
    paddingHorizontal: 16,
  },
  detailChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  detailBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  detailBadgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  detailRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 16,
  },
  detailColLeft: {
    flex: 1,
  },
  detailColRight: {
    flex: 1,
  },
  detailSection: {
    marginBottom: 16,
  },
  setTypeOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  setTypeSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  setTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  setTypeChipPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
