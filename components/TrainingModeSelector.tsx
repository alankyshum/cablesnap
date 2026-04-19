import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import type { TrainingMode } from "../lib/types";
import { TRAINING_MODE_LABELS } from "../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  modes: TrainingMode[];
  selected: TrainingMode;
  exercise: string;
  onSelect: (mode: TrainingMode) => void;
  compact?: boolean;
};

function TrainingModeSelector({ modes, selected, exercise, onSelect, compact: isCompact }: Props) {
  const colors = useThemeColors();
  const [tooltip, setTooltip] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((mode: TrainingMode) => {
    setTooltip(TRAINING_MODE_LABELS[mode].description);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTooltip(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleSelect = useCallback((mode: TrainingMode) => {
    onSelect(mode);
    AccessibilityInfo.announceForAccessibility(
      `Switched to ${TRAINING_MODE_LABELS[mode].label} mode`
    );
  }, [onSelect]);

  return (
    <View style={isCompact ? styles.containerCompact : styles.container}>
      <View
        style={isCompact ? styles.rowCompact : styles.row}
        accessibilityRole="radiogroup"
        accessibilityLabel={`Training mode selector for ${exercise}`}
      >
        {modes.map((mode) => {
          const info = TRAINING_MODE_LABELS[mode];
          const active = selected === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => handleSelect(mode)}
              onLongPress={() => showTooltip(mode)}
              style={[
                isCompact ? styles.chipCompact : styles.chip,
                { borderColor: colors.primary },
                active && { backgroundColor: colors.primary },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${info.label} training mode`}
            >
              <Text style={[
                isCompact ? styles.labelCompact : styles.label,
                { color: active ? colors.onPrimary : colors.primary },
              ]}>
                {info.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tooltip && (
        <View style={[styles.tooltip, { backgroundColor: colors.inverseSurface }]}>
          <Text style={{ color: colors.inverseOnSurface, fontSize: fontSizes.xs }}>
            {tooltip}
          </Text>
        </View>
      )}

    </View>
  );
}

export default memo(TrainingModeSelector);

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  containerCompact: {
    marginBottom: 0,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  rowCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minWidth: 56,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCompact: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
  labelCompact: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
  tooltip: {
    marginHorizontal: 4,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
