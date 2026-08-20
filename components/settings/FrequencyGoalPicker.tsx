import { Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { fontSizes } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";

type Props = {
  colors: ThemeColors;
  value: number | null;
  onChange: (goal: number | null) => void;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

const MIN_DAYS = 1;
const MAX_DAYS = 7;
const BUTTON_SIZE = 36;

export default function FrequencyGoalPicker({ colors, value, onChange, bareContent = false }: Props) {
  const canDecrement = value != null && value > MIN_DAYS;
  const canIncrement = value != null && value < MAX_DAYS;

  const content = (
    <>
      <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600", fontSize: fontSizes.sm, marginBottom: 4 }}>
        {t({ id: "settings.frequencyGoal.title", message: "Weekly Training Goal" })}
      </Text>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
        {t({ id: "settings.frequencyGoal.description", message: "Shown on the home screen to track workouts completed vs. your target each week." })}
      </Text>
      {value == null ? (
        <Pressable
          onPress={() => onChange(3)}
          accessibilityRole="button"
          accessibilityLabel={t({ id: "settings.frequencyGoal.setA11y", message: "Set weekly training goal" })}
          style={[styles.setButton, { borderColor: colors.primary }]}
        >
          <Text variant="body" style={{ color: colors.primary, fontWeight: "600", fontSize: fontSizes.sm }}>
            {t({ id: "settings.frequencyGoal.set", message: "Set a goal" })}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.stepperRow}>
          <View style={styles.stepper} accessibilityLabel={i18n._({ id: "settings.frequencyGoal.valueA11y", message: "Weekly training goal: {value, plural, one {# day} other {# days}}", values: { value } })}>
            <Pressable
              onPress={() => canDecrement && onChange(value - 1)}
              disabled={!canDecrement}
              accessibilityRole="button"
              accessibilityLabel={t({ id: "settings.frequencyGoal.decreaseA11y", message: "Decrease training days" })}
              style={[styles.stepButton, { backgroundColor: colors.surfaceVariant, opacity: canDecrement ? 1 : 0.35 }]}
            >
              <MaterialCommunityIcons name="minus" size={20} color={colors.onSurface} />
            </Pressable>
            <Text variant="body" style={[styles.stepValue, { color: colors.onSurface }]}>
              {i18n._({ id: "settings.frequencyGoal.value", message: "{value, plural, one {# day} other {# days}} / week", values: { value } })}
            </Text>
            <Pressable
              onPress={() => canIncrement && onChange(value + 1)}
              disabled={!canIncrement}
              accessibilityRole="button"
              accessibilityLabel={t({ id: "settings.frequencyGoal.increaseA11y", message: "Increase training days" })}
              style={[styles.stepButton, { backgroundColor: colors.surfaceVariant, opacity: canIncrement ? 1 : 0.35 }]}
            >
              <MaterialCommunityIcons name="plus" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel={t({ id: "settings.frequencyGoal.clearA11y", message: "Clear weekly training goal" })}
            style={styles.clearButton}
          >
            <Text variant="caption" style={{ color: colors.primary }}>
              {t({ id: "settings.frequencyGoal.clear", message: "Clear" })}
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );

  if (bareContent) return <View>{content}</View>;

  return (
    <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { fontWeight: "700", fontSize: fontSizes.base, minWidth: 100, textAlign: "center" },
  setButton: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  clearButton: { paddingVertical: 4, paddingHorizontal: 8 },
});
