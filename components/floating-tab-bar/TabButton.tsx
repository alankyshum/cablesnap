import { t } from "@lingui/core/macro";
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated from "react-native-reanimated";
import { fontSizes, spacing } from "@/constants/design-tokens";
import { HandleIcon } from "./HandleIcon";
import { useAnimatedPress } from "@/lib/animations/hooks";
import * as Haptics from "expo-haptics";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const TAB_ICONS: Record<string, IconName> = {
  nutrition: "food-apple",
  index: "arm-flex",
  progress: "chart-line",
  settings: "cog",
};

export const TAB_LABELS: Record<string, string> = {
  nutrition: "Nutrition",
  index: "Workouts",
  progress: "Progress",
  settings: "Settings",
};

function getTabLabels(): Record<string, string> {
  return {
    nutrition: t({ id: "floatingTabBar.tabs.nutrition", message: "Nutrition" }),
    index: t({ id: "floatingTabBar.tabs.workouts", message: "Workouts" }),
    progress: t({ id: "floatingTabBar.tabs.progress", message: "Progress" }),
    settings: t({ id: "floatingTabBar.tabs.settings", message: "Settings" }),
  };
}

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
  const label = getTabLabels()[routeName] ?? routeName;
  const color = focused ? activeColor : inactiveColor;
  const isWorkouts = routeName === "index";
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ haptic: false });

  return (
    <AnimatedPressable
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
        style={[tabStyles.label, { color }]}
      >
        {label}
      </Animated.Text>
    </AnimatedPressable>
  );
}

const tabStyles = StyleSheet.create({
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
    minHeight: 48,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
    marginTop: spacing.xs,
    textAlign: "center",
    includeFontPadding: false,
  },
});
