/* eslint-disable max-lines-per-function */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import TrainingModeSelector from "../../components/TrainingModeSelector";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ExerciseNotesPanel } from "./ExerciseNotesPanel";
import { MountPositionChip } from "./MountPositionChip";
import type { SetWithMeta, ExerciseGroup } from "./types";
import type { TrainingMode } from "../../lib/types";
import { fontSizes } from "../../constants/design-tokens";

export type GroupCardHeaderProps = {
  group: ExerciseGroup;
  /**
   * BLD-560: per-group subscription slice. Previously this component received
   * the full `modes: Record<string, TrainingMode>` record, which caused every
   * group's header to re-render whenever ANY exercise's mode changed (the
   * Record reference busts shallow equality on every update). By narrowing
   * to the scalar mode value for *this* group, React.memo (see bottom of
   * this file) can skip re-renders when an unrelated exercise's mode
   * changes.
   *
   * Falls back to `group.training_modes[0]` when undefined.
   */
  currentMode: TrainingMode | undefined;
  exerciseNotesOpen: boolean;
  exerciseNotesDraft: string | undefined;
  firstSet: SetWithMeta | undefined;
  previousPerformance?: string | null;
  previousPerformanceA11y?: string | null;
  onModeChange: (exerciseId: string, mode: TrainingMode) => void;
  onExerciseNotes: (exerciseId: string, text: string) => void;
  onExerciseNotesDraftChange: (exerciseId: string, text: string) => void;
  onToggleExerciseNotes: (exerciseId: string) => void;
  onShowDetail: (exerciseId: string) => void;
  onSwap: (exerciseId: string) => void;
  onDeleteExercise: (exerciseId: string) => void;
  onMoveUp?: (exerciseId: string) => void;
  onMoveDown?: (exerciseId: string) => void;
  onPrefill?: (exerciseId: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
  showMoveButtons?: boolean;
};

function ProgressionIcon({ suggested, color }: { suggested?: boolean; color: string }) {
  if (!suggested) return null;
  return <MaterialCommunityIcons name="arrow-up-bold" size={14} color={color} accessibilityLabel="Weight progression suggested" />;
}

function GroupCardHeaderInner({ group, currentMode, exerciseNotesOpen, exerciseNotesDraft, firstSet, previousPerformance, previousPerformanceA11y, onModeChange, onExerciseNotes, onExerciseNotesDraftChange, onToggleExerciseNotes, onShowDetail, onSwap, onDeleteExercise, onMoveUp, onMoveDown, onPrefill, isFirst, isLast, showMoveButtons }: GroupCardHeaderProps) {
  // BLD-560: dev-only render counter for memoization regression detection.
  // Metro strips the require + call-site in prod via __DEV__ DCE (matches the
  // pattern in lib/db/helpers.ts and scripts/verify-scenario-hook-not-in-bundle.sh).
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("../../lib/dev/render-counter") as typeof import("../../lib/dev/render-counter")).countRender("GroupCardHeader");
  }
  const colors = useThemeColors();
  const notesValue = exerciseNotesDraft ?? firstSet?.notes ?? "";
  const eid = group.exercise_id;

  return (
    <>
      <View style={styles.headerWrap}>
        <View style={styles.headerRow1}>
          <View style={{ flex: 1, flexShrink: 1 }}>
            <Pressable onLongPress={() => onDeleteExercise(eid)} delayLongPress={500} accessibilityLabel={`Remove ${group.name}`} accessibilityRole="button" accessibilityHint="Long press to remove exercise">
              <Text variant="title" style={[styles.groupTitle, { color: colors.primary }]}>{group.name}</Text>
            </Pressable>
            {previousPerformance != null && (
              <Pressable
                onPress={() => onPrefill?.(eid)}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={({ pressed }) => [styles.previousPerfBtn, pressed && styles.previousPerfPressed]}
                accessibilityRole="button"
                accessibilityLabel={previousPerformanceA11y ?? previousPerformance}
                accessibilityHint="Tap to refill from previous"
              >
                <ProgressionIcon suggested={group.progressionSuggested} color={colors.primary} />
                <Text numberOfLines={1} style={[styles.previousPerf, { color: colors.primary }]}>
                  {previousPerformance}
                </Text>
                {/* BLD-551: trailing refresh glyph restores tappability affordance lost in BLD-542. */}
                <MaterialCommunityIcons
                  name="refresh"
                  size={14}
                  color={colors.primary}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </Pressable>
            )}
          </View>
          <MountPositionChip mount={group.mount_position} />
          <View style={styles.headerActions}>
            {showMoveButtons && (
              <>
                <Pressable
                  onPress={() => onMoveUp?.(eid)}
                  disabled={isFirst}
                  accessibilityLabel={`Move ${group.name} up`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isFirst }}
                  hitSlop={4}
                  style={[styles.moveBtn, isFirst && styles.moveBtnDisabled]}
                >
                  <MaterialCommunityIcons name="chevron-up" size={28} color={isFirst ? colors.outlineVariant : colors.onSurfaceVariant} />
                </Pressable>
                <Pressable
                  onPress={() => onMoveDown?.(eid)}
                  disabled={isLast}
                  accessibilityLabel={`Move ${group.name} down`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLast }}
                  hitSlop={4}
                  style={[styles.moveBtn, isLast && styles.moveBtnDisabled]}
                >
                  <MaterialCommunityIcons name="chevron-down" size={28} color={isLast ? colors.outlineVariant : colors.onSurfaceVariant} />
                </Pressable>
              </>
            )}
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
            <TrainingModeSelector modes={group.training_modes} selected={currentMode ?? group.training_modes[0]} exercise={group.name} onSelect={(m) => onModeChange(eid, m)} compact />
          )}
        </View>
      </View>
      {exerciseNotesOpen && <ExerciseNotesPanel exerciseId={eid} value={notesValue} onDraftChange={onExerciseNotesDraftChange} onSave={onExerciseNotes} />}
    </>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 4, marginBottom: 8 },
  headerRow1: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  headerRow2: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  headerActions: { flexDirection: "row", alignItems: "center" },
  groupTitle: { fontWeight: "700" },
  previousPerf: { fontSize: fontSizes.xs, lineHeight: 16, flexShrink: 1 },
  // minHeight:36 is below the 44dp touch target minimum; compensated by hitSlop
  // ({ top:12, bottom:12, left:8, right:8 }) on the Pressable above → ~60dp tap-zone.
  // Keep hitSlop in sync if you change minHeight.
  previousPerfBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, flexWrap: "wrap" },
  previousPerfPressed: { opacity: 0.7 },
  iconBtn: { padding: 8 },
  moveBtn: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  moveBtnDisabled: { opacity: 0.4 },
  detailsBtn: { marginLeft: -24, marginRight: -8 },
});

/**
 * BLD-560: wrapped in React.memo + narrowed currentMode prop so unrelated
 * exercise mode changes don't cascade re-renders across every group header.
 *
 * Measurement (jest harness: __tests__/components/session/GroupCardHeader.memo.test.tsx):
 *   Before: 11 renders per 10 unrelated-mode-change cycles (initial + 10).
 *   After:   1 render  per 10 unrelated-mode-change cycles (initial only).
 *   Delta:  -91% — well above the ≥30% bar in the BLD-560 QD pre-criteria.
 */
export const GroupCardHeader = React.memo(GroupCardHeaderInner);
