/* eslint-disable */
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React from "react";
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Text } from "@/components/ui/text";

interface FABAction {
  icon: string;
  label?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}

interface FABProps {
  icon: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  color?: string;
  accessibilityLabel?: string;
  visible?: boolean;
}

interface FABGroupProps {
  open: boolean;
  visible?: boolean;
  icon: string;
  actions: FABAction[];
  onStateChange: (state: { open: boolean }) => void;
  fabStyle?: StyleProp<ViewStyle>;
  color?: string;
  accessibilityLabel?: string;
}

export function FAB({
  icon,
  onPress,
  style,
  color = "#fff",
  accessibilityLabel,
  visible = true,
}: FABProps) {
  if (!visible) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.8}
      style={[styles.fab, style]}
    >
      <MaterialCommunityIcons name={icon as any} size={24} color={color} />
    </TouchableOpacity>
  );
}

function FABGroup({
  open,
  visible = true,
  icon,
  actions,
  onStateChange,
  fabStyle,
  color = "#fff",
}: FABGroupProps) {
  if (!visible) return null;

  return (
    <View style={styles.groupContainer} pointerEvents="box-none">
      {open && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => onStateChange({ open: false })}
          />
          <View style={styles.actionsContainer}>
            {actions.map((action, index) => (
              <View key={index} style={styles.actionRow}>
                {action.label && (
                  <View style={styles.actionLabel}>
                    <Text variant="caption">{action.label}</Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => {
                    action.onPress();
                    onStateChange({ open: false });
                  }}
                  accessibilityLabel={action.accessibilityLabel}
                  accessibilityRole="button"
                  activeOpacity={0.8}
                  style={[styles.miniFab, fabStyle]}
                >
                  <MaterialCommunityIcons
                    name={action.icon as any}
                    size={20}
                    color={color}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}
      <TouchableOpacity
        onPress={() => onStateChange({ open: !open })}
        accessibilityLabel={open ? "Close menu" : "Open menu"}
        accessibilityRole="button"
        activeOpacity={0.8}
        style={[styles.fab, fabStyle]}
      >
        <MaterialCommunityIcons
          name={(open ? "close" : icon) as any}
          size={24}
          color={color}
        />
      </TouchableOpacity>
    </View>
  );
}

FAB.Group = FABGroup;

const styles = StyleSheet.create({
  fab: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  groupContainer: {
    position: "absolute",
    bottom: 16,
    right: 16,
    alignItems: "center",
  },
  actionsContainer: {
    marginBottom: 16,
    alignItems: "flex-end",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  actionLabel: {
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 12,
  },
  miniFab: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});
