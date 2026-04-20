import React, { useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useThemeColors } from "@/hooks/useThemeColors";
import { CenterButton } from "./floating-tab-bar/CenterButton";
import { TabButton } from "./floating-tab-bar/TabButton";

const BAR_HEIGHT = 56;
const BAR_MARGIN_BOTTOM = 24;
const BAR_BUFFER = 8;
/** Base height used for content padding (bar + margins + buffer). Add insets.bottom for full value. */
export const FLOATING_TAB_BAR_HEIGHT = BAR_HEIGHT + BAR_MARGIN_BOTTOM + BAR_BUFFER;

const BAR_BORDER_RADIUS = 24;
const BAR_HORIZONTAL_MARGIN = 16;

/**
 * Hook to get the total floating tab bar height including safe area.
 * All tab screens must use this for bottom padding.
 */
export function useFloatingTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return FLOATING_TAB_BAR_HEIGHT + insets.bottom;
}

// Desired visual order: exercises, nutrition, index (center), progress, settings
const TAB_ORDER = ["exercises", "nutrition", "index", "progress", "settings"];

export default function FloatingTabBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";
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
          shadowColor: colors.shadow,
        },
        animatedContainerStyle,
      ]}
      pointerEvents={keyboardVisible ? "none" : "auto"}
    >
      <View style={styles.blurClip}>
        <BlurView
          intensity={80}
          tint={isDark ? "dark" : "light"}
          experimentalBlurMethod="dimezisBlurView"
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(30,30,30,0.45)" : "rgba(255,255,255,0.5)" }]}
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
              color={colors.onSurfaceVariant}
              activeColor={colors.primary}
              backgroundColor={colors.surfaceVariant}
            />
          );
        }

        return (
          <TabButton
            key={name}
            routeName={name}
            focused={focused}
            onPress={handlePress}
            activeColor={colors.primary}
            inactiveColor={colors.onSurfaceVariant}
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
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
  },
  blurClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BAR_BORDER_RADIUS,
    overflow: "hidden",
  },
});
