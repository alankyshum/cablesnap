import { StyleSheet, useColorScheme, View } from "react-native";
import { Text } from "@/components/ui/text";
import { STRENGTH_LEVEL_COLORS } from "@/constants/theme";
import { toDisplay } from "@/lib/units";
import { fontSizes } from "@/constants/design-tokens";
import type { StrengthLevel } from "@/lib/strength-standards";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ThemeColors;
  level: StrengthLevel;
  nextLevel: StrengthLevel | null;
  nextThresholdKg: number | null;
  unit: "kg" | "lb";
  style?: object;
};

const LEVEL_LABELS: Record<StrengthLevel, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  elite: "Elite",
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

  const nextText = nextLevel && nextThresholdKg != null
    ? `${LEVEL_LABELS[nextLevel]} at ${toDisplay(nextThresholdKg, unit)} ${unit}`
    : null;

  const a11yLabel = nextText
    ? `Strength level: ${LEVEL_LABELS[level]}. Next level ${nextText}.`
    : `Strength level: ${LEVEL_LABELS[level]}.`;

  return (
    <View style={[styles.container, style]} accessibilityLabel={a11yLabel}>
      <View style={[styles.badge, { backgroundColor: badgeColor.bg }]}>
        <Text style={[styles.levelText, { color: badgeColor.text }]}>
          {LEVEL_LABELS[level]}
        </Text>
      </View>
      {nextText && (
        <Text
          variant="caption"
          style={[styles.nextHint, { color: colors.onSurfaceVariant }]}
        >
          Next: {nextText}
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
