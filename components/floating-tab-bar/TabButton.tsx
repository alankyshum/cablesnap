import React from "react";
import { Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated from "react-native-reanimated";
import { fontSizes } from "@/constants/design-tokens";
import { HandleIcon } from "./HandleIcon";
import { useAnimatedPress } from "@/lib/animations/hooks";
import * as Haptics from "expo-haptics";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const TAB_ICONS: Record<string, IconName> = {
  exercises: "format-list-bulleted",
  nutrition: "food-apple",
  index: "arm-flex",
  progress: "chart-line",
  settings: "cog",
};

const TAB_LABELS: Record<string, string> = {
  exercises: "Exercises",
  nutrition: "Nutrition",
  index: "Workouts",
  progress: "Progress",
  settings: "Settings",
};

type TabButtonProps = {
  routeName: string;
  focused: boolean;
  onPress: () => void;
  activeColor: string;
  inactiveColor: string;
};

export function TabButton({
  routeName,
  focused,
  onPress,
  activeColor,
  inactiveColor,
}: TabButtonProps) {
  const icon = TAB_ICONS[routeName] ?? "help-circle";
  const label = TAB_LABELS[routeName] ?? routeName;
  const color = focused ? activeColor : inactiveColor;
  const isWorkouts = routeName === "index";
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ haptic: false });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { onPressIn(); Haptics.selectionAsync(); }}
      onPressOut={onPressOut}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={[tabStyles.button, animatedStyle as unknown as import('react-native').ViewStyle]}
    >
      {isWorkouts ? (
        <HandleIcon size={28} color={color} />
      ) : (
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      )}
      <Animated.Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={[tabStyles.label, { color }]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const tabStyles = StyleSheet.create({
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
    minHeight: 48,
    paddingVertical: 4,
  },
  label: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
    marginTop: 2,
    textAlign: "center",
    includeFontPadding: false,
    paddingHorizontal: 2,
  },
});
