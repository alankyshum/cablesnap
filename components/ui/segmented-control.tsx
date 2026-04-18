/* eslint-disable */
import { Text } from "@/components/ui/text";
import { useColor } from "@/hooks/useColor";
import { CORNERS, FONT_SIZE, HEIGHT } from "@/theme/globals";
import React from "react";
import { Pressable, ScrollView, TextStyle, View, ViewStyle } from "react-native";

export interface SegmentedControlButton {
  value: string;
  label: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

interface SegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  buttons: readonly SegmentedControlButton[] | SegmentedControlButton[];
  style?: ViewStyle;
}

export function SegmentedControl({
  value,
  onValueChange,
  buttons,
  style,
}: SegmentedControlProps) {
  const bgColor = useColor("muted");
  const activeBg = useColor("background");
  const activeText = useColor("primary");
  const inactiveText = useColor("mutedForeground");

  return (
    <View
      style={[
        {
          flexDirection: "row",
          backgroundColor: bgColor,
          borderRadius: CORNERS,
          padding: 4,
          minHeight: HEIGHT,
        },
        style,
      ]}
    >
      {(buttons as SegmentedControlButton[]).map((btn) => {
        const isActive = btn.value === value;
        return (
          <Pressable
            key={btn.value}
            onPress={() => onValueChange(btn.value)}
            accessibilityLabel={btn.accessibilityLabel ?? btn.label}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            style={[
              {
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: CORNERS,
                paddingHorizontal: 8,
                paddingVertical: 6,
                backgroundColor: isActive ? activeBg : "transparent",
              },
              btn.style,
            ]}
          >
            <Text
              style={{
                fontSize: FONT_SIZE - 2,
                fontWeight: isActive ? "600" : "400",
                color: isActive ? activeText : inactiveText,
                textAlign: "center",
              }}
            >
              {btn.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
