/* eslint-disable */
import { Text } from "@/components/ui/text";
import { useColor } from "@/hooks/useColor";
import { BORDER_RADIUS } from "@/theme/globals";
import React from "react";
import { Pressable, ViewStyle, type Role } from "react-native";

interface ChipProps {
  children: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  compact?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityRole?: "radio" | "checkbox";
  accessibilityState?: { selected?: boolean };
  role?: Role;
}

export function Chip({
  children,
  selected = false,
  onPress,
  compact = false,
  disabled,
  icon,
  style,
  accessibilityLabel,
  accessibilityRole = "radio",
  accessibilityState,
  role,
}: ChipProps) {
  const primaryColor = useColor("primary");
  const primaryFg = useColor("primaryForeground");
  const mutedColor = useColor("muted");
  const textColor = useColor("text");

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState ?? { selected }}
      role={role}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: compact ? 10 : 14,
          paddingVertical: compact ? 4 : 6,
          borderRadius: BORDER_RADIUS,
          backgroundColor: selected ? primaryColor : mutedColor,
        },
        style,
      ]}
    >
      {icon && <>{icon}</>}
      {typeof children === "string" ? (
        <Text
          style={{
            fontSize: 14,
            fontWeight: selected ? "600" : "400",
            color: selected ? primaryFg : textColor,
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
