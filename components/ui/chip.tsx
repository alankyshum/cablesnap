/* eslint-disable */
import { Text } from "@/components/ui/text";
import { useColor } from "@/hooks/useColor";
import { BORDER_RADIUS } from "@/theme/globals";
import React from "react";
import { Pressable, ViewStyle } from "react-native";

interface ChipProps {
  children: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  compact?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityRole?: "radio" | "checkbox";
  accessibilityState?: { selected?: boolean };
}

export function Chip({
  children,
  selected = false,
  onPress,
  compact = false,
  style,
  accessibilityLabel,
  accessibilityRole = "radio",
  accessibilityState,
}: ChipProps) {
  const primaryColor = useColor("primary");
  const primaryFg = useColor("primaryForeground");
  const mutedColor = useColor("muted");
  const textColor = useColor("text");

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState ?? { selected }}
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
