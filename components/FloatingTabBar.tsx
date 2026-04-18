import React, { useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "react-native-paper";
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
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

const BAR_HEIGHT = 56;
const BAR_MARGIN_BOTTOM = 24;
const BAR_BUFFER = 8;
/** Base height used for content padding (bar + margins + buffer). Add insets.bottom for full value. */
export const FLOATING_TAB_BAR_HEIGHT = BAR_HEIGHT + BAR_MARGIN_BOTTOM + BAR_BUFFER;

const CENTER_BUTTON_SIZE = 72;
const BAR_BORDER_RADIUS = 24;
const BAR_HORIZONTAL_MARGIN = 16;

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

/**
 * Hook to get the total floating tab bar height including safe area.
 * All tab screens must use this for bottom padding.
 */
export function useFloatingTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return FLOATING_TAB_BAR_HEIGHT + insets.bottom;
}

function CenterButton({
  focused,
  onPress,
  color,
  activeColor,
  backgroundColor,
}: {
  focused: boolean;
  onPress: () => void;
  color: string;
  activeColor: string;
  backgroundColor: string;
}) {
  const theme = useTheme();
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
              shadowColor: theme.colors.shadow,
            },
          ]}
        >
          <Animated.View style={iconAnimatedStyle}>
            <MaterialCommunityIcons
              name="arm-flex"
              size={28}
              color={focused ? theme.colors.onPrimary : color}
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

function TabButton({
  routeName,
  focused,
  onPress,
  activeColor,
  inactiveColor,
}: {
  routeName: string;
  focused: boolean;
  onPress: () => void;
  activeColor: string;
  inactiveColor: string;
}) {
  const icon = TAB_ICONS[routeName] ?? "help-circle";
  const label = TAB_LABELS[routeName] ?? routeName;
  const color = focused ? activeColor : inactiveColor;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={tabStyles.button}
    >
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Animated.Text
        numberOfLines={1}
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
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    textAlign: "center",
    includeFontPadding: false,
  },
});

// Desired visual order: exercises, nutrition, index (center), progress, settings
const TAB_ORDER = ["exercises", "nutrition", "index", "progress", "settings"];

export default function FloatingTabBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const translateY = useSharedValue(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      translateY.value = withTiming(200, { duration: 250 });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      translateY.value = withTiming(0, { duration: 250 });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [translateY]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Build route map for quick lookup
  const routeMap = new Map(
    state.routes.map((route, idx) => [route.name, { route, index: idx }])
  );

  const orderedTabs = TAB_ORDER.filter((name) => routeMap.has(name));
  const centerIndex = orderedTabs.indexOf("index");

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + BAR_MARGIN_BOTTOM,
          shadowColor: theme.colors.shadow,
        },
        animatedContainerStyle,
      ]}
      pointerEvents={keyboardVisible ? "none" : "auto"}
    >
      <View style={styles.blurClip}>
        <BlurView
          intensity={80}
          tint={theme.dark ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? "rgba(30,30,30,0.7)" : "rgba(255,255,255,0.75)" }]}
        />
      </View>
      {orderedTabs.map((name, visualIdx) => {
        const entry = routeMap.get(name)!;
        const focused = state.index === entry.index;

        const handlePress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: entry.route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(entry.route.name);
          }
        };

        if (visualIdx === centerIndex) {
          return (
            <CenterButton
              key={name}
              focused={focused}
              onPress={handlePress}
              color={theme.colors.onSurfaceVariant}
              activeColor={theme.colors.primary}
              backgroundColor={theme.colors.surfaceVariant}
            />
          );
        }

        return (
          <TabButton
            key={name}
            routeName={name}
            focused={focused}
            onPress={handlePress}
            activeColor={theme.colors.primary}
            inactiveColor={theme.colors.onSurfaceVariant}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: BAR_HORIZONTAL_MARGIN,
    right: BAR_HORIZONTAL_MARGIN,
    height: BAR_HEIGHT,
    borderRadius: BAR_BORDER_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    // @ts-expect-error -- web-only boxShadow for cross-platform shadow
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
  },
  blurClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BAR_BORDER_RADIUS,
    overflow: "hidden",
  },
});
