import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { FlowCardMenuItem } from "./FlowCard";
import type { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  items: FlowCardMenuItem[];
  isDark: boolean;
  colors: ReturnType<typeof useThemeColors>;
  onClose: () => void;
};

export function FlowCardMenu({ items, isDark, colors, onClose }: Props) {
  return (
    <View style={[styles.menu, { backgroundColor: isDark ? colors.surfaceVariant : colors.surface, borderColor: colors.outlineVariant }]}>
      {items.map((item, i) => (
        <Pressable
          key={i}
          onPress={() => { onClose(); item.onPress(); }}
          style={({ pressed }) => [
            styles.item,
            pressed && { backgroundColor: colors.surfaceVariant },
            i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
          ]}
          accessibilityLabel={item.label}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name={item.icon} size={18} color={item.destructive ? colors.error : colors.onSurface} />
          <Text variant="body" style={{ color: item.destructive ? colors.error : colors.onSurface, fontSize: 14 }}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { marginTop: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
});
