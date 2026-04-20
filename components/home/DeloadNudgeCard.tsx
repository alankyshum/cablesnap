import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { OverreachingResult } from "@/lib/overreaching";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  colors: ThemeColors;
  result: OverreachingResult;
  onDismiss: () => void;
};

export default function DeloadNudgeCard({ colors, result, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  const firedSignals = result.signals.filter((s) => s.fired);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel="Your training data suggests you may benefit from a lighter week. Tap to see details."
        accessibilityState={{ expanded }}
      >
        <MaterialCommunityIcons
          name="battery-low"
          size={20}
          color={colors.primary}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        />
        <Text
          variant="body"
          style={[styles.title, { color: colors.onSurface }]}
          numberOfLines={expanded ? undefined : 2}
        >
          Consider a lighter training week
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss deload suggestion"
          accessibilityHint="Hides this suggestion for 7 days"
        >
          <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          {firedSignals.map((signal) => (
            <View key={signal.id} style={styles.signalRow}>
              <Text
                variant="caption"
                style={[styles.signalBullet, { color: colors.onSurfaceVariant }]}
                accessibilityLabel={signal.accessibilityLabel}
              >
                • {signal.detail}
              </Text>
            </View>
          ))}
          <Text
            variant="caption"
            style={[styles.guidance, { color: colors.onSurfaceVariant }]}
            accessibilityLabel="Deload guidance: Try reducing weights to 60% and sets by 40% this week"
          >
            Try reducing weights to 60% and sets by 40% this week.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 4,
    marginBottom: 12,
    gap: 10,
    minHeight: 56,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  details: {
    paddingLeft: 30,
    paddingRight: 12,
    gap: 6,
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  signalBullet: {
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  guidance: {
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: 4,
    fontStyle: "italic",
  },
});
