import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { FlowCardMenuItem } from "./FlowCard";
import type { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { Colors } from "@/theme/colors";

type Props = {
  items: FlowCardMenuItem[];
  isDark: boolean;
  colors: ReturnType<typeof useThemeColors>;
  anchorY: number;
  anchorX: number;
  onClose: () => void;
};

export function FlowCardMenu({ items, isDark, colors, anchorY, anchorX, onClose }: Props) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss menu">
        <View
          style={[
            styles.menu,
            {
              backgroundColor: isDark ? colors.surfaceVariant : colors.surface,
              borderColor: colors.outlineVariant,
              top: anchorY,
              left: anchorX,
            },
          ]}
        >
          {items.map((item, i) => (
            <Pressable
              key={i}
              onPress={() => { onClose(); item.onPress(); }}
              style={({ pressed }) => [
                styles.item,
                pressed && { backgroundColor: isDark ? colors.surface : colors.surfaceVariant },
                i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
              ]}
              accessibilityLabel={item.label}
              accessibilityRole="menuitem"
            >
              <MaterialCommunityIcons name={item.icon} size={18} color={item.destructive ? colors.error : colors.onSurface} />
              <Text variant="body" style={{ color: item.destructive ? colors.error : colors.onSurface, fontSize: fontSizes.sm }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  menu: {
    position: "absolute",
    minWidth: 160,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    elevation: 8,
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
});
