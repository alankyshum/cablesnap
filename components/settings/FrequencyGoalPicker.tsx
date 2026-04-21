import { Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ThemeColors;
  value: number | null;
  onChange: (goal: number | null) => void;
};

const MIN_DAYS = 1;
const MAX_DAYS = 7;
const BUTTON_SIZE = 36;

export default function FrequencyGoalPicker({ colors, value, onChange }: Props) {
  const canDecrement = value != null && value > MIN_DAYS;
  const canIncrement = value != null && value < MAX_DAYS;

  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600", fontSize: fontSizes.sm, marginBottom: 4 }}>
          Weekly Training Goal
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
          Shown on the home screen to track workouts completed vs. your target each week.
        </Text>
        {value == null ? (
          <Pressable
            onPress={() => onChange(3)}
            accessibilityRole="button"
            accessibilityLabel="Set weekly training goal"
            style={[styles.setButton, { borderColor: colors.primary }]}
          >
            <Text variant="body" style={{ color: colors.primary, fontWeight: "600", fontSize: fontSizes.sm }}>
              Set a goal
            </Text>
          </Pressable>
        ) : (
          <View style={styles.stepperRow}>
            <View style={styles.stepper} accessibilityLabel={`Weekly training goal: ${value} days`}>
              <Pressable
                onPress={() => canDecrement && onChange(value - 1)}
                disabled={!canDecrement}
                accessibilityRole="button"
                accessibilityLabel="Decrease training days"
                style={[styles.stepButton, { backgroundColor: colors.surfaceVariant, opacity: canDecrement ? 1 : 0.35 }]}
              >
                <MaterialCommunityIcons name="minus" size={20} color={colors.onSurface} />
              </Pressable>
              <Text variant="body" style={[styles.stepValue, { color: colors.onSurface }]}>
                {value} {value === 1 ? "day" : "days"} / week
              </Text>
              <Pressable
                onPress={() => canIncrement && onChange(value + 1)}
                disabled={!canIncrement}
                accessibilityRole="button"
                accessibilityLabel="Increase training days"
                style={[styles.stepButton, { backgroundColor: colors.surfaceVariant, opacity: canIncrement ? 1 : 0.35 }]}
              >
                <MaterialCommunityIcons name="plus" size={20} color={colors.onSurface} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => onChange(null)}
              accessibilityRole="button"
              accessibilityLabel="Clear weekly training goal"
              style={styles.clearButton}
            >
              <Text variant="caption" style={{ color: colors.primary }}>
                Clear
              </Text>
            </Pressable>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { fontWeight: "700", fontSize: fontSizes.md, minWidth: 100, textAlign: "center" },
  setButton: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  clearButton: { paddingVertical: 4, paddingHorizontal: 8 },
});
