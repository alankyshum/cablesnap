import { StyleSheet, useColorScheme, View } from "react-native";
import { Text } from "@/components/ui/text";
import { STRENGTH_LEVEL_COLORS } from "@/constants/theme";
import { toDisplay } from "@/lib/units";
import { fontSizes } from "@/constants/design-tokens";
import type { StrengthLevel } from "@/lib/strength-standards";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

type Props = {
  colors: ThemeColors;
  level: StrengthLevel;
  nextLevel: StrengthLevel | null;
  nextThresholdKg: number | null;
  unit: "kg" | "lb";
  style?: object;
};

export default function StrengthLevelBadge({
  colors,
  level,
  nextLevel,
  nextThresholdKg,
  unit,
  style,
}: Props) {
  const scheme = useColorScheme();
  const palette = scheme === "dark" ? STRENGTH_LEVEL_COLORS.dark : STRENGTH_LEVEL_COLORS.light;
  const badgeColor = palette[level];
  const levelLabels: Record<StrengthLevel, string> = {
    beginner: t({ id: "components.exercise.strength-level.beginner", message: "Beginner" }),
    novice: t({ id: "components.exercise.strength-level.novice", message: "Novice" }),
    intermediate: t({ id: "components.exercise.strength-level.intermediate", message: "Intermediate" }),
    advanced: t({ id: "components.exercise.strength-level.advanced", message: "Advanced" }),
    elite: t({ id: "components.exercise.strength-level.elite", message: "Elite" }),
  };

  const nextText = nextLevel && nextThresholdKg != null
    ? t({ id: "components.exercise.strength-level.next-text", message: `${levelLabels[nextLevel]} at ${toDisplay(nextThresholdKg, unit)} ${unit}` })
    : null;

  const a11yLabel = nextText
    ? t({ id: "components.exercise.strength-level.a11y-next", message: `Strength level: ${levelLabels[level]}. Next level ${nextText}.` })
    : t({ id: "components.exercise.strength-level.a11y", message: `Strength level: ${levelLabels[level]}.` });

  return (
    <View style={[styles.container, style]} accessibilityLabel={a11yLabel}>
      <View style={[styles.badge, { backgroundColor: badgeColor.bg }]}>
        <Text style={[styles.levelText, { color: badgeColor.text }]}>
          {levelLabels[level]}
        </Text>
      </View>
      {nextText && (
        <Text
          variant="caption"
          style={[styles.nextHint, { color: colors.onSurfaceVariant }]}
        >
          {t({ id: "components.exercise.strength-level.next", message: `Next: ${nextText}` })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  levelText: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  nextHint: {
    fontSize: fontSizes.xs,
    flexShrink: 1,
  },
});
