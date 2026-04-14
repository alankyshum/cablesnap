import React from "react";
import { Pressable, ViewStyle, StyleProp } from "react-native";
import { Card, CardProps } from "react-native-paper";
import Animated from "react-native-reanimated";
import { useAnimatedPress } from "../../lib/animations/hooks";
import { elevation as elevationTokens, ElevationKey } from "../../constants/design-tokens";

interface PressableCardProps extends Omit<CardProps, "elevation"> {
  onPress?: () => void;
  onLongPress?: () => void;
  elevation?: ElevationKey;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PressableCard({
  onPress,
  onLongPress,
  elevation = "low",
  haptic = true,
  style,
  children,
  ...cardProps
}: PressableCardProps) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ haptic });
  const shadowStyle = elevationTokens[elevation];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View style={[animatedStyle, shadowStyle as ViewStyle, style]}>
        <Card {...cardProps}>{children}</Card>
      </Animated.View>
    </Pressable>
  );
}
