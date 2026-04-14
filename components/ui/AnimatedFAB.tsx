import React from "react";
import { Pressable, ViewStyle, StyleProp } from "react-native";
import { FAB } from "react-native-paper";
import Animated from "react-native-reanimated";
import { useAnimatedPress, useEntrance } from "../../lib/animations/hooks";

interface AnimatedFABProps {
  icon: string;
  label?: string;
  onPress?: () => void;
  haptic?: boolean;
  entranceDelay?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function AnimatedFAB({
  icon,
  label,
  haptic = true,
  entranceDelay = 200,
  style,
  onPress,
  accessibilityLabel,
}: AnimatedFABProps) {
  const { animatedStyle: pressStyle, onPressIn, onPressOut } =
    useAnimatedPress({ haptic });
  const entranceStyle = useEntrance(entranceDelay);

  return (
    <Animated.View style={[entranceStyle, pressStyle, style]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
        <FAB
          icon={icon}
          label={label}
          onPress={onPress}
          accessibilityLabel={accessibilityLabel}
        />
      </Pressable>
    </Animated.View>
  );
}
