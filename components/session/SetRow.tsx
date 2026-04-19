/* eslint-disable complexity, max-lines-per-function */
import React, { useCallback, useMemo, memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import WeightPicker from "../../components/WeightPicker";
import { rpeColor, rpeText } from "../../lib/rpe";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { RPE_CHIPS, RPE_LABELS, type SetWithMeta } from "./types";
import { SET_TYPE_LABELS } from "../../lib/types";

export function formatDurationDisplay(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "0:00";
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type SetRowProps = {
  set: SetWithMeta;
  step: number;
  unit: "kg" | "lb";
  halfStep: { setId: string; base: number } | null;
  trackingMode: "reps" | "duration";
  onUpdate: (setId: string, field: "weight" | "reps" | "duration_seconds", val: string) => void;
  onCheck: (set: SetWithMeta) => void;
  onDelete: (setId: string) => void;
  onRPE: (set: SetWithMeta, val: number) => void;
  onHalfStep: (setId: string, val: number) => void;
  onHalfStepClear: () => void;
  onHalfStepOpen: (setId: string, base: number) => void;
  onCycleSetType: (setId: string) => void;
  onLongPressSetType: (setId: string) => void;
  // Timer controls (duration mode only)
  isTimerRunning?: boolean;
  isTimerActive?: boolean;
  timerDisplaySeconds?: number;
  onTimerStart?: (setId: string) => void;
  onTimerStop?: (setId: string) => void;
};

export const SetRow = memo(function SetRow({
  set, step, unit, halfStep, trackingMode,
  onUpdate, onCheck, onDelete, onRPE, onHalfStep, onHalfStepClear,
  onHalfStepOpen, onCycleSetType, onLongPressSetType,
  isTimerRunning, isTimerActive, timerDisplaySeconds,
  onTimerStart, onTimerStop,
}: SetRowProps) {
  const colors = useThemeColors();

  const onWeightChange = useCallback((v: number) => onUpdate(set.id, "weight", String(v)), [set.id, onUpdate]);
  const onRepsChange = useCallback((v: number) => onUpdate(set.id, "reps", String(v)), [set.id, onUpdate]);
  const onDurationChange = useCallback((v: number) => onUpdate(set.id, "duration_seconds", String(v)), [set.id, onUpdate]);

  const isDurationMode = trackingMode === "duration";

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
          {isDurationMode ? (
            <View style={styles.durationCol}>
              <View style={styles.durationRow}>
                <Pressable
                  onPress={() => {
                    if (isTimerActive && isTimerRunning) {
                      onTimerStop?.(set.id);
                    } else {
                      onTimerStart?.(set.id);
                    }
                  }}
                  style={[
                    styles.timerButton,
                    { backgroundColor: isTimerActive && isTimerRunning ? colors.error : colors.primary },
                  ]}
                  accessibilityLabel={isTimerActive && isTimerRunning ? "Stop set timer" : "Start set timer"}
                  accessibilityHint={isTimerActive && isTimerRunning
                    ? "Double tap to stop and record duration"
                    : "Double tap to start timing this set"}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name={isTimerActive && isTimerRunning ? "stop" : "play"}
                    size={22}
                    color={isTimerActive && isTimerRunning ? colors.onError : colors.onPrimary}
                  />
                </Pressable>
                {isTimerActive && isTimerRunning ? (
                  <Text
                    style={[styles.timerDisplay, { color: colors.primary }]}
                    accessibilityRole="timer"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={`Timer: ${formatDurationDisplay(timerDisplaySeconds ?? 0)}`}
                  >
                    {formatDurationDisplay(timerDisplaySeconds ?? 0)}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }}>
                    <WeightPicker
                      value={set.duration_seconds}
                      step={1}
                      onValueChange={onDurationChange}
                      accessibilityLabel={`Set ${set.set_number} duration, ${set.duration_seconds ?? 0} seconds`}
                      max={36000}
                    />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.pickerCol}>
              <WeightPicker
                value={set.reps}
                step={1}
                onValueChange={onRepsChange}
                accessibilityLabel={`Set ${set.set_number} reps`}
                max={999}
              />
            </View>
          )}
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

const styles = StyleSheet.create({
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
  colPrev: {
    width: 64,
    textAlign: "center",
  },
  warmupChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
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
  durationCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timerButton: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
    minHeight: 56,
  },
  timerDisplay: {
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flex: 1,
    textAlign: "center",
  },
});
