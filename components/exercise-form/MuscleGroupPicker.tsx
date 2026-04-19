import { Animated, View, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { type MuscleGroup, MUSCLE_GROUPS_BY_REGION, MUSCLE_LABELS } from "../../lib/types";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  label: string;
  muscles: Set<MuscleGroup>;
  onToggle: (muscle: MuscleGroup) => void;
  autoFillHighlight: Animated.AnimatedInterpolation<string>;
  isAutoFilled: boolean;
  error?: string;
  colors: ThemeColors;
  /** Prefix for accessibility labels, e.g. "Primary muscle" or "Secondary muscle" */
  accessibilityPrefix: string;
};

export function MuscleGroupPicker({
  label,
  muscles,
  onToggle,
  autoFillHighlight,
  isAutoFilled,
  error,
  colors,
  accessibilityPrefix,
}: Props) {
  return (
    <Animated.View
      style={{
        backgroundColor: isAutoFilled ? autoFillHighlight : "transparent",
        borderRadius: 8,
        paddingHorizontal: 4,
      }}
    >
      <Text
        variant="caption"
        style={[styles.label, { color: colors.onSurface, fontWeight: "600" }]}
      >
        {label}
      </Text>
      {MUSCLE_GROUPS_BY_REGION.map((region) => (
        <View key={region.label} style={styles.region}>
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}
          >
            {region.label}
          </Text>
          <View style={styles.chipWrap}>
            {region.muscles.map((m) => (
              <Chip
                key={m}
                selected={muscles.has(m)}
                onPress={() => onToggle(m)}
                style={styles.chip}
                compact
                accessibilityLabel={`${accessibilityPrefix}: ${MUSCLE_LABELS[m]}`}
                accessibilityRole="checkbox"
                accessibilityState={{ selected: muscles.has(m) }}
              >
                {MUSCLE_LABELS[m]}
              </Chip>
            ))}
          </View>
        </View>
      ))}
      {error && (
        <Text
          variant="caption"
          style={{ color: colors.error, marginHorizontal: 16 }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 16, marginBottom: 8 },
  region: { marginBottom: 8, marginLeft: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { marginBottom: 2 },
});
