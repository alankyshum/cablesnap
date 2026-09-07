import { initializeI18n } from "@/lib/i18n";
initializeI18n();
import { t } from "@lingui/core/macro";
/**
 * SetTimerCell — BLD-1235
 *
 * Renders the timer button + countdown display (or duration picker) for a
 * single set row. Subscribes directly to SetTimerContext so only THIS
 * component re-renders each second — SetRow itself remains stable.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import WeightPicker from "../WeightPicker";
import { useThemeColors } from "@/hooks/useThemeColors";
import { radii, fontSizes } from "@/constants/design-tokens";
import { useSetTimerContext } from "./SetTimerContext";
import { formatDurationDisplay } from "./timerUtils";

type SetTimerCellProps = {
  setId: string;
  exerciseId?: string;
  setIndex?: number;
  displayedDuration: number;
  step?: number;
  onDurationChange?: (value: number) => void;
  accessibilityLabel?: string;
};

export function SetTimerCell({
  setId,
  exerciseId,
  setIndex,
  displayedDuration,
  step = 1,
  onDurationChange,
  accessibilityLabel,
}: SetTimerCellProps) {
  const colors = useThemeColors();
  const { isRunning, displaySeconds, activeExerciseId, activeSetIndex, onTimerStart, onTimerStop } =
    useSetTimerContext();

  const isActiveSet =
    activeExerciseId != null &&
    exerciseId != null &&
    activeExerciseId === exerciseId &&
    activeSetIndex === setIndex;
  const isTimerActive = isActiveSet && isRunning;

  return (
    <View style={styles.durationRow}>
      <Pressable
        onPress={() => {
          if (isTimerActive) {
            onTimerStop(setId);
          } else {
            onTimerStart(setId);
          }
        }}
        style={[
          styles.timerButton,
          { backgroundColor: isTimerActive ? colors.error : colors.primary },
        ]}
        accessibilityLabel={isTimerActive ? "Stop set timer" : "Start set timer"}
        accessibilityHint={
          isTimerActive
            ? "Double tap to stop and record duration"
            : "Double tap to start timing this set"
        }
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name={isTimerActive ? "stop" : "play"}
          size={22}
          color={isTimerActive ? colors.onError : colors.onPrimary}
        />
      </Pressable>
      {isTimerActive ? (
        <Text
          style={[styles.timerDisplay, { color: colors.primary }]}
          accessibilityRole="timer"
          accessibilityLiveRegion="polite"
          accessibilityLabel={t({ id: "session.settimercell.dynamic1", message: `Timer: ${formatDurationDisplay(displaySeconds)}` })}
        >
          {formatDurationDisplay(displaySeconds)}
        </Text>
      ) : (
        <View style={{ flex: 1 }}>
          <WeightPicker
            value={displayedDuration}
            step={step}
            onValueChange={onDurationChange ?? (() => {})}
            accessibilityLabel={accessibilityLabel}
            max={36000}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: fontSizes.xl,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flex: 1,
    textAlign: "center",
  },
});
