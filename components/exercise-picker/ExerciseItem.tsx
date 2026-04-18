import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { CATEGORY_LABELS, type Exercise } from "../../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

export const ITEM_HEIGHT = 64;

interface ExerciseItemProps {
  item: Exercise;
  onPick: (exercise: Exercise) => void;
}

function ExerciseItem({ item, onPick }: ExerciseItemProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => onPick(item)}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.outlineVariant,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityLabel={`Select ${item.name}${item.is_custom ? " (Custom)" : ""}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}`}
      accessibilityRole="button"
    >
      <View>
        <Text
          variant="body"
          numberOfLines={1}
          style={{ color: colors.onSurface, fontWeight: "600" }}
        >
          {item.name}{item.is_custom ? " (Custom)" : ""}
        </Text>
        <View style={styles.row}>
          <View
            style={[
              styles.badge,
              { backgroundColor: colors.primaryContainer },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.onPrimaryContainer }]}>
              {CATEGORY_LABELS[item.category]}
            </Text>
          </View>
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, marginLeft: 8 }}
          >
            {item.equipment}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: ITEM_HEIGHT,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
  },
});

export default React.memo(ExerciseItem);
