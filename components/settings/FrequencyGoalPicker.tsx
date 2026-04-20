import { Pressable, StyleSheet, View } from "react-native";
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

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const CIRCLE_SIZE = 40;
const HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

export default function FrequencyGoalPicker({ colors, value, onChange }: Props) {
  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600", fontSize: fontSizes.sm, marginBottom: 4 }}>
          Weekly Training Goal
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
          How many days per week do you want to train?
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Weekly training goal" style={styles.circleRow}>
          {DAYS.map((day) => {
            const selected = value === day;
            return (
              <Pressable
                key={day}
                onPress={() => onChange(day)}
                hitSlop={HIT_SLOP}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${day} day${day > 1 ? "s" : ""} per week`}
                style={[
                  styles.circle,
                  selected
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.onSurfaceVariant },
                ]}
              >
                <Text
                  variant="body"
                  style={{
                    color: selected ? colors.onPrimary : colors.onSurface,
                    fontWeight: "700",
                    fontSize: fontSizes.sm,
                  }}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {value != null && (
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
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  circleRow: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButton: { marginTop: 8, alignSelf: "flex-end" },
});
