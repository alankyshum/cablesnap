import { Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { Insight } from "@/lib/insights";

type Props = {
  colors: ThemeColors;
  insight: Insight;
  onPress: () => void;
  onDismiss: () => void;
};

export default function InsightCard({ colors, insight, onPress, onDismiss }: Props) {
  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={insight.accessibilityLabel}
    >
      <Ionicons
        name={insight.icon}
        size={20}
        color={colors.primary}
        accessibilityElementsHidden={true}
        importantForAccessibility="no"
      />
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
    fontSize: 14,
    lineHeight: 20,
  },
  dismiss: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
