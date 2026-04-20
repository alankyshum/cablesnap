import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '@/hooks/useThemeColors';

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
        <MaterialCommunityIcons
          name="arm-flex"
          size={28}
          color={focused ? colors.onPrimary : color}
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
