import { useCallback, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";
import type { TrainingMode } from "../lib/types";
import { TRAINING_MODE_LABELS } from "../lib/types";

type Props = {
  modes: TrainingMode[];
  selected: TrainingMode;
  exercise: string;
  tempo: string;
  onSelect: (mode: TrainingMode) => void;
  onTempoChange: (tempo: string) => void;
};

export default function TrainingModeSelector({ modes, selected, exercise, tempo, onSelect, onTempoChange }: Props) {
  const theme = useTheme();
  const [tooltip, setTooltip] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((mode: TrainingMode) => {
    setTooltip(TRAINING_MODE_LABELS[mode].description);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTooltip(null), 3000);
  }, []);

  const handleSelect = useCallback((mode: TrainingMode) => {
    onSelect(mode);
    AccessibilityInfo.announceForAccessibility(
      `Switched to ${TRAINING_MODE_LABELS[mode].label} mode`
    );
  }, [onSelect]);

  const sanitize = (val: string) => {
    if (!val || /^[\s-]*$/.test(val)) return null;
    return val;
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.row}
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
                styles.chip,
                { borderColor: theme.colors.primary },
                active && { backgroundColor: theme.colors.primary },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${info.label} training mode`}
            >
              <Text style={[
                styles.label,
                { color: active ? theme.colors.onPrimary : theme.colors.primary },
              ]}>
                {info.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tooltip && (
        <View style={[styles.tooltip, { backgroundColor: theme.colors.inverseSurface }]}>
          <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 13 }}>
            {tooltip}
          </Text>
        </View>
      )}

      {selected === "eccentric_overload" && (
        <View style={styles.tempoContainer}>
          <TextInput
            mode="outlined"
            dense
            placeholder="Tempo (e.g. 3-1-5-1)"
            value={tempo}
            onChangeText={onTempoChange}
            onBlur={() => onTempoChange(sanitize(tempo) ?? "")}
            maxLength={15}
            style={styles.tempoInput}
            accessibilityLabel="Tempo notation, for example 3 1 5 1"
            accessibilityHint="Enter four numbers separated by dashes: eccentric, pause, concentric, pause seconds"
          />
          <Text
            variant="labelSmall"
            style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}
          >
            Seconds: Eccentric – Pause – Concentric – Pause
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
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
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
  tooltip: {
    marginHorizontal: 4,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tempoContainer: {
    paddingHorizontal: 4,
    marginTop: 8,
  },
  tempoInput: {
    fontSize: 14,
  },
  helper: {
    marginTop: 4,
    fontSize: 12,
    fontStyle: "italic",
  },
});
