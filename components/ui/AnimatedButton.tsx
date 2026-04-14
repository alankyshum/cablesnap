import React from "react";
import { ViewStyle, StyleProp } from "react-native";
import { Button, ButtonProps } from "react-native-paper";
import Animated from "react-native-reanimated";
import { useAnimatedPress } from "../../lib/animations/hooks";

interface AnimatedButtonProps extends ButtonProps {
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedButton({
  haptic = true,
  style,
  onPress,
  ...buttonProps
}: AnimatedButtonProps) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ haptic });

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Button
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        {...buttonProps}
      />
    </Animated.View>
  );
}
