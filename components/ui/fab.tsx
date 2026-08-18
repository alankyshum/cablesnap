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
import { Colors } from "@/theme/colors";
import { useAnimatedPress } from "@/lib/animations/hooks";
import { elevation, radii, spacing } from "@/constants/design-tokens";

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
  color = Colors.light.onToast,
  accessibilityLabel,
  visible = true,
}: FABProps) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  if (!visible) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.8}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.fab, animatedStyle as unknown as ViewStyle, style]}
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
  color = Colors.light.onToast,
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
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.medium,
  },
  groupContainer: {
    position: "absolute",
    bottom: spacing.base,
    right: spacing.base,
    alignItems: "center",
  },
  actionsContainer: {
    marginBottom: spacing.base,
    alignItems: "flex-end",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  actionLabel: {
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    marginRight: spacing.md,
  },
  miniFab: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.low,
  },
});
