/* eslint-disable max-lines-per-function */
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import { MUSCLE_LABELS } from "../../lib/types";
import type { MuscleGroup } from "../../lib/types";
import type { VolumeLandmarks } from "../../lib/volume-landmarks";
import { DEFAULT_LANDMARKS } from "../../lib/volume-landmarks";

type Props = {
  visible: boolean;
  onClose: () => void;
  landmarks: Record<MuscleGroup, VolumeLandmarks>;
  onSave: (muscle: MuscleGroup, value: VolumeLandmarks) => void;
  onReset: (muscle: MuscleGroup) => void;
  onResetAll: () => void;
};

const MUSCLE_KEYS = Object.keys(MUSCLE_LABELS) as MuscleGroup[];
const MIN_MEV = 0;
const MIN_MRV = 1;
const MAX_SETS = 50;

function NumericStepper({
  label,
  value,
  onIncrement,
  onDecrement,
  min,
  max,
  colors,
}: {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min: number;
  max: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={stepperStyles.container}>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, width: 36 }}>
        {label}
      </Text>
      <Button
        variant="secondary"
        size="sm"
        onPress={onDecrement}
        disabled={value <= min}
        accessibilityLabel={`Decrease ${label}`}
        style={stepperStyles.btn}
      >
        <Text>−</Text>
      </Button>
      <Text
        variant="body"
        style={{ color: colors.onSurface, width: 32, textAlign: "center", fontWeight: "600" }}
        accessibilityLabel={`${label}: ${value}`}
      >
        {value}
      </Text>
      <Button
        variant="secondary"
        size="sm"
        onPress={onIncrement}
        disabled={value >= max}
        accessibilityLabel={`Increase ${label}`}
        style={stepperStyles.btn}
      >
        <Text>+</Text>
      </Button>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btn: {
    minWidth: 40,
    minHeight: 40,
  },
});

export default function VolumeLandmarksSheet({
  visible,
  onClose,
  landmarks,
  onSave,
  onReset,
  onResetAll,
}: Props) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState<MuscleGroup | null>(null);
  const [pending, setPending] = useState<Map<MuscleGroup, VolumeLandmarks>>(new Map());

  const handleClose = useCallback(() => {
    for (const [muscle, value] of pending.entries()) {
      onSave(muscle, value);
    }
    setPending(new Map());
    setExpanded(null);
    onClose();
  }, [onClose, onSave, pending]);

  const handleToggle = useCallback((muscle: MuscleGroup) => {
    setExpanded((prev) => (prev === muscle ? null : muscle));
  }, []);

  const handleMevChange = useCallback(
    (muscle: MuscleGroup, delta: number) => {
      setPending((prev) => {
        const next = new Map(prev);
        const current = next.get(muscle) ?? landmarks[muscle];
        const newMev = Math.max(MIN_MEV, Math.min(current.mrv, current.mev + delta, MAX_SETS));
        next.set(muscle, { ...current, mev: newMev });
        return next;
      });
      setExpanded(muscle);
    },
    [landmarks]
  );

  const handleMrvChange = useCallback(
    (muscle: MuscleGroup, delta: number) => {
      setPending((prev) => {
        const next = new Map(prev);
        const current = next.get(muscle) ?? landmarks[muscle];
        const newMrv = Math.max(Math.max(MIN_MRV, current.mev), Math.min(current.mrv + delta, MAX_SETS));
        next.set(muscle, { ...current, mrv: newMrv });
        return next;
      });
      setExpanded(muscle);
    },
    [landmarks]
  );

  const handleResetMuscle = useCallback(
    (muscle: MuscleGroup) => {
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(muscle);
        return next;
      });
      onReset(muscle);
      setExpanded(muscle);
    },
    [onReset]
  );

  const handleResetAll = useCallback(() => {
    setPending(new Map());
    onResetAll();
    setExpanded(null);
  }, [onResetAll]);

  return (
    <BottomSheet
      isVisible={visible}
      onClose={handleClose}
      title="Customize Volume Targets"
      snapPoints={[0.6, 0.9]}
    >
      <Button
        variant="secondary"
        size="sm"
        onPress={handleResetAll}
        accessibilityLabel="Reset all volume targets to defaults"
        style={{ marginBottom: 12, alignSelf: "flex-start" }}
      >
        <Text>Reset All to Defaults</Text>
      </Button>

      {MUSCLE_KEYS.map((muscle) => {
        const lm = pending.get(muscle) ?? landmarks[muscle];
        const isDefault =
          lm.mev === DEFAULT_LANDMARKS[muscle].mev &&
          lm.mrv === DEFAULT_LANDMARKS[muscle].mrv;
        const isExpanded = expanded === muscle;

        return (
          <View key={muscle}>
            <Pressable
              onPress={() => handleToggle(muscle)}
              style={[
                styles.muscleRow,
                { borderBottomColor: colors.outlineVariant },
                isExpanded && { backgroundColor: colors.primary + "10" },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${MUSCLE_LABELS[muscle]}: MEV ${lm.mev}, MRV ${lm.mrv}${isDefault ? "" : " (customized)"}`}
              accessibilityState={{ expanded: isExpanded }}
            >
              <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
                {MUSCLE_LABELS[muscle]}
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                MEV {lm.mev} / MRV {lm.mrv}
                {!isDefault ? " ✎" : ""}
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}>
                {isExpanded ? "▼" : "›"}
              </Text>
            </Pressable>

            {isExpanded && (
              <View style={[styles.expandedArea, { backgroundColor: colors.surface }]}>
                <NumericStepper
                  label="MEV"
                  value={lm.mev}
                  onDecrement={() => handleMevChange(muscle, -1)}
                  onIncrement={() => handleMevChange(muscle, 1)}
                  min={MIN_MEV}
                  max={Math.min(lm.mrv - 1, MAX_SETS)}
                  colors={colors}
                />
                <NumericStepper
                  label="MRV"
                  value={lm.mrv}
                  onDecrement={() => handleMrvChange(muscle, -1)}
                  onIncrement={() => handleMrvChange(muscle, 1)}
                  min={Math.max(MIN_MRV, lm.mev + 1)}
                  max={MAX_SETS}
                  colors={colors}
                />
                {!isDefault && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => handleResetMuscle(muscle)}
                    accessibilityLabel={`Reset ${MUSCLE_LABELS[muscle]} to default`}
                    style={{ marginTop: 4 }}
                  >
                    <Text>Reset</Text>
                  </Button>
                )}
                {lm.mev === lm.mrv && (
                  <Text variant="caption" style={{ color: colors.tertiary, marginTop: 4 }}>
                    Your optimal zone is very narrow
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 12, textAlign: "center" }}>
        Based on RP hypertrophy guidelines
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  muscleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  expandedArea: {
    padding: 12,
    paddingLeft: 16,
    gap: 8,
  },
});
