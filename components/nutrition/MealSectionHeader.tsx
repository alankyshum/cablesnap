import React from "react";
import { TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import type { DailyLog, Meal } from "@/lib/types";
import type { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  section: { title: string; meal: Meal; data: DailyLog[] };
  colors: ReturnType<typeof useThemeColors>;
  onSaveAsTemplate: (meal: Meal, items: DailyLog[]) => void;
};

export function MealSectionHeader({ section, colors, onSaveAsTemplate }: Props) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
      <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
        {section.title}
      </Text>
      {section.data.length > 0 && (
        <TouchableOpacity
          onPress={() => onSaveAsTemplate(section.meal, section.data)}
          accessibilityLabel={`Save ${section.title} as template`}
          accessibilityRole="button"
          hitSlop={8}
          style={{ padding: 8, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialCommunityIcons name="content-save-outline" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      )}
    </View>
  );
}
