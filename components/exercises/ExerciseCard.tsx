import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import {
  CATEGORY_LABELS,
  ATTACHMENT_LABELS,
  type Exercise,
} from "../../lib/types";
import { semantic, DIFFICULTY_COLORS } from "../../constants/theme";
import { radii } from "../../constants/design-tokens";

export interface ExerciseCardProps {
  item: Exercise;
  selected: boolean;
  onPress: () => void;
  colors: ThemeColors;
  mc: { primary: string; secondary: string };
}

export function ExerciseCard({ item, selected, onPress, colors, mc }: ExerciseCardProps) {
  const diff = item.difficulty || "intermediate";
  const color = DIFFICULTY_COLORS[diff] || semantic.intermediate;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.exerciseCard,
        { borderLeftColor: color, borderLeftWidth: 3, backgroundColor: colors.surface, shadowColor: colors.shadow },
        selected && { backgroundColor: colors.primaryContainer },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityLabel={`${item.name}${item.is_custom ? ", Custom" : ""}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}, Difficulty: ${diff}`}
      accessibilityRole="button"
    >
      <View style={styles.cardInner}>
        <View style={styles.titleRow}>
          <Text variant="subtitle" numberOfLines={1} style={[{ color: colors.onSurface }, styles.titleText]}>
            {item.name}
          </Text>
          {item.is_custom && (
            <View style={[styles.customBadge, { backgroundColor: colors.tertiaryContainer }]}>
              <Text style={[styles.customBadgeText, { color: colors.onSurface }]}>Custom</Text>
            </View>
          )}
        </View>
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
          numberOfLines={1}
        >
          {CATEGORY_LABELS[item.category]} · {item.equipment}{item.attachment ? ` · ${ATTACHMENT_LABELS[item.attachment]}` : ""}
        </Text>
        <View style={styles.muscleRow}>
          {item.primary_muscles.map((m) => (
            <View key={m} style={styles.muscleBadge}>
              <View style={[styles.muscleDot, { backgroundColor: mc.primary }]} />
              <Text style={[styles.muscleLabel, { color: colors.onSurfaceVariant }]}>{m}</Text>
            </View>
          ))}
          {item.secondary_muscles.map((m) => (
            <View key={`s-${m}`} style={styles.muscleBadge}>
              <View style={[styles.muscleDot, { backgroundColor: mc.secondary }]} />
              <Text style={[styles.muscleLabel, { color: colors.onSurfaceVariant }]}>{m}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  exerciseCard: {
    flex: 1,
    marginHorizontal: 6,
    marginVertical: 4,
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  cardInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  titleText: {
    flexShrink: 1,
  },
  customBadge: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  customBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  muscleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  muscleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  muscleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  muscleLabel: {
    fontSize: 12,
  },
});
