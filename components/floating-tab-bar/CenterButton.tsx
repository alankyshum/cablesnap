import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useThemeColors } from '@/hooks/useThemeColors';
import { HandleIcon } from './HandleIcon';
import { useAnimatedPress } from '@/lib/animations/hooks';
import * as Haptics from 'expo-haptics';

const CENTER_BUTTON_SIZE = 70;
const BAR_HEIGHT = 56;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ haptic: false });

  return (
    <View style={centerStyles.wrapper}>
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel="Workouts"
        accessibilityHint="Navigate to workout screen"
        accessibilityState={{ selected: focused }}
        onPressIn={() => { onPressIn(); Haptics.selectionAsync(); }}
        onPressOut={onPressOut}
        style={[
          centerStyles.button,
          animatedStyle as unknown as import('react-native').ViewStyle,
          {
            backgroundColor: focused ? activeColor : backgroundColor,
          },
        ]}
      >
        <HandleIcon
          size={36}
          color={focused ? colors.onPrimary : color}
        />
      </AnimatedPressable>
    </View>
  );
}

const centerStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CENTER_BUTTON_SIZE + 16,
    height: BAR_HEIGHT,
  },
  button: {
    width: CENTER_BUTTON_SIZE,
    height: CENTER_BUTTON_SIZE,
    borderRadius: CENTER_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
