import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/* eslint-disable max-lines-per-function */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SetRow } from "./SetRow";
import type { SetWithMeta, ExerciseGroup } from "./types";
import type { StackWithCalibrations } from "@/hooks/useActiveCalibration";
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
  /** BLD-2701: Active intensity display mode (RPE | RIR). */
  intensityMode?: import("@/lib/intensity").IntensityMode;
  // BLD-1126: Stack Marker Quick-Pick
  // BLD-1130 G3: stacks fetched once in ExerciseGroupCard; passed through.
  gymId?: string | null;
  stacks?: StackWithCalibrations[];
  onMarkerConfirm?: (setId: string, result: { stackId: string; stackName: string; marker: number; trueWeight: number; unit: string }) => void;
  onManualWeightSave?: (setId: string, weight: number | null, reps: number | null) => void;
  /** BLD-1175: Mini-set segment handlers. */
  onAddSegment?: (setId: string, reps: number) => Promise<void> | void;
  onDeleteSegment?: (segmentId: string, setId: string) => Promise<void> | void;
  onCollapseToNormal?: (setId: string) => Promise<void> | void;
};

export function ExerciseGroupSetTable({
  group, step, unit, isDurationMode, showWarmupButton, colors,
  onUpdate, onCheck, onDelete, onAddSet, onAddWarmups,
  onCycleSetType, onLongPressSetType,
  onOpenBodyweightModifier, onClearBodyweightModifier,
  onOpenVariantPicker, onClearVariant,
  onOpenBodyweightGripPicker, onClearBodyweightGrip,
  hasClipMap, onVideoGlyph,
  onOpenPulleyPinPicker, showPulleyPin, hasSetupPhotoMap, setupPhotoUriMap, onSetupPhotoGlyph,
  captureRpe, onRpeChange,
  intensityMode,
  gymId, stacks, onMarkerConfirm, onManualWeightSave,
  onAddSegment, onDeleteSegment, onCollapseToNormal,
}: ExerciseGroupSetTableProps) {
  return (
    <>
      <View style={styles.headerRow}>
        <Text variant="caption" style={[styles.colSet, { color: colors.onSurfaceVariant }]}>{t({ id: "session.exercisegroupsettable.str1", message: "SET" })}</Text>
        <Text variant="caption" style={[styles.colPrev, { color: colors.onSurfaceVariant }]}>{t({ id: "session.exercisegroupsettable.str2", message: "PREV" })}</Text>
        <Text variant="caption" style={[styles.colLabel, { color: colors.onSurfaceVariant }]}>
          {group.is_bodyweight ? "LOAD" : (unit === "lb" ? "LB" : "KG")}
        </Text>
        <Text variant="caption" style={[styles.colLabel, { color: colors.onSurfaceVariant }]}>{isDurationMode ? "DURATION" : "REPS"}</Text>
        <View style={styles.colTrailing} />
      </View>
      {group.sets.map((set, idx) => (
        <SetRow
          key={set.id}
          set={group.track_unilateral ? (set.left || set) : set}
          rightSet={group.track_unilateral ? set.right : undefined}
          trackUnilateral={group.track_unilateral}
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
          exerciseId={group.exercise_id}
          setIndex={idx}
          hasClip={hasClipMap?.[set.id] ?? false}
          onVideoGlyph={onVideoGlyph}
          pulleyPin={set.pulley_pin ?? null}
          onOpenPulleyPinPicker={onOpenPulleyPinPicker}
          showPulleyPin={showPulleyPin}
          hasSetupPhoto={hasSetupPhotoMap?.[set.id] ?? false}
          setupPhotoUri={setupPhotoUriMap?.[set.id]}
          onSetupPhotoGlyph={onSetupPhotoGlyph}
          captureRpe={captureRpe}
          onRpeChange={onRpeChange}
          intensityMode={intensityMode}
          gymId={gymId}
          stacks={stacks}
          onMarkerConfirm={onMarkerConfirm}
          onManualWeightSave={onManualWeightSave}
          onAddSegment={onAddSegment}
          onDeleteSegment={onDeleteSegment}
          onCollapseToNormal={onCollapseToNormal}
        />
      ))}
      <View style={styles.actionRow}>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => onAddSet(group.exercise_id)}
          style={styles.addSetBtn}
          accessibilityLabel={t({ id: "session.exercisegroupsettable.dynamic1", message: `Add set to ${group.name}` })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "600" }}>{t({ id: "session.exercisegroupsettable.str3", message: "Add Set" })}</Text>
          </View>
        </Button>
        {showWarmupButton && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onAddWarmups(group.exercise_id)}
            style={styles.addSetBtn}
            accessibilityLabel={t({ id: "session.exercisegroupsettable.dynamic2", message: `Add warmup sets for ${group.name}` })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="fire" size={18} color={colors.tertiary ?? colors.primary} />
              <Text style={{ color: colors.tertiary ?? colors.primary, fontWeight: "600" }}>{t({ id: "session.exercisegroupsettable.str4", message: "Add Warmups" })}</Text>
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
