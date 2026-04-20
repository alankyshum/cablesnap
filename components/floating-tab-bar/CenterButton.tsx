import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const handleIcon = require('../../assets/tab-handle.png');

const CENTER_BUTTON_SIZE = 70;
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

  return (
    <View style={centerStyles.wrapper}>
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel="Workouts"
        accessibilityHint="Navigate to workout screen"
        accessibilityState={{ selected: focused }}
        style={[
          centerStyles.button,
          {
            backgroundColor: focused ? activeColor : backgroundColor,
          },
        ]}
      >
        <Image
          source={handleIcon}
          style={{
            width: 36,
            height: 36,
            tintColor: focused ? colors.onPrimary : color,
          }}
        />
      </Pressable>
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
