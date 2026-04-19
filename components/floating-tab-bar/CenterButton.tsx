import React, { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  useReducedMotion,
} from "react-native-reanimated";
import { useThemeColors } from "@/hooks/useThemeColors";

const CENTER_BUTTON_SIZE = 72;
const BAR_HEIGHT = 56;

type CenterButtonProps = {
  focused: boolean;
  onPress: () => void;
  color: string;
  activeColor: string;
  backgroundColor: string;
};

export function CenterButton({
  focused,
  onPress,
  color,
  activeColor,
  backgroundColor,
}: CenterButtonProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const iconScale = useSharedValue(1);
  const iconRotate = useSharedValue(0);

  useEffect(() => {
    if (focused && !reducedMotion) {
      // Natural arm-flex: rotate like curling a bicep + slight squeeze
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      iconRotate.value = withRepeat(
        withSequence(
          withTiming(-12, { duration: 400 }),
          withTiming(8, { duration: 350 }),
          withTiming(-5, { duration: 300 }),
          withTiming(0, { duration: 250 }),
          withTiming(0, { duration: 700 }),
        ),
        -1,
        false,
      );
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      iconScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 400 }),
          withTiming(1.0, { duration: 350 }),
          withTiming(1.06, { duration: 300 }),
          withTiming(1.0, { duration: 250 }),
          withTiming(1.0, { duration: 700 }),
        ),
        -1,
        false,
      );
    } else {
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      iconScale.value = withTiming(1, { duration: 200 });
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      iconRotate.value = withTiming(0, { duration: 200 });
    }
  }, [focused, reducedMotion, iconScale, iconRotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${iconRotate.value}deg` },
      { scale: iconScale.value },
    ],
  }));

  const handlePressIn = useCallback(() => {
    if (reducedMotion) {
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      opacity.value = withTiming(0.7, { duration: 0 });
    } else {
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      scale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
    }
  }, [reducedMotion, scale, opacity]);

  const handlePressOut = useCallback(() => {
    if (reducedMotion) {
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      opacity.value = withTiming(1, { duration: 0 });
    } else {
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared value
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    }
  }, [reducedMotion, scale, opacity]);

  return (
    <View style={centerStyles.wrapper}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="tab"
          accessibilityLabel="Workouts"
          accessibilityHint="Navigate to workout screen"
          accessibilityState={{ selected: focused }}
          style={[
            centerStyles.button,
            {
              backgroundColor: focused ? activeColor : backgroundColor,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <Animated.View style={iconAnimatedStyle}>
            <MaterialCommunityIcons
              name="arm-flex"
              size={28}
              color={focused ? colors.onPrimary : color}
            />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const centerStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: CENTER_BUTTON_SIZE + 16,
    height: BAR_HEIGHT,
  },
  button: {
    width: CENTER_BUTTON_SIZE,
    height: CENTER_BUTTON_SIZE,
    borderRadius: CENTER_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
