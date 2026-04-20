import { Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { Insight } from "@/lib/insights";
import { fontSizes } from "@/constants/design-tokens";

const IONICON_MAP: Record<string, string> = {
  "trending-up": "trending-up",
  "bar-chart": "bar-chart",
  "star": "star",
  "heart": "heart",
};

type Props = {
  colors: ThemeColors;
  insight: Insight;
  onPress: () => void;
  onDismiss: () => void;
};

export default function InsightCard({ colors, insight, onPress, onDismiss }: Props) {
  const isMCI = insight.icon === "bullseye-arrow";

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={insight.accessibilityLabel}
    >
      {isMCI ? (
        <MaterialCommunityIcons
          name="bullseye-arrow"
          size={20}
          color={colors.primary}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        />
      ) : (
        <Ionicons
          name={IONICON_MAP[insight.icon] as keyof typeof Ionicons.glyphMap ?? "trending-up"}
          size={20}
          color={colors.primary}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        />
      )}
      <Text
        variant="body"
        style={[styles.title, { color: colors.onSurface }]}
        numberOfLines={2}
      >
        {insight.title}
      </Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss insight"
      >
        <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 4,
    marginBottom: 12,
    gap: 10,
    minHeight: 56,
  },
  title: {
    flex: 1,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  dismiss: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
