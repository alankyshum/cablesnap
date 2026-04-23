import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useThemeColors } from '@/hooks/useThemeColors';
import { CenterButton } from './floating-tab-bar/CenterButton';
import { TabButton } from './floating-tab-bar/TabButton';

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
const TAB_ORDER = ['exercises', 'nutrition', 'index', 'progress', 'settings'];

export default function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const translateY = useSharedValue(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

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
  const routeMap = new Map(state.routes.map((route, idx) => [route.name, { route, index: idx }]));

  const orderedTabs = TAB_ORDER.filter((name) => routeMap.has(name));
  const centerIndex = orderedTabs.indexOf('index');

  return (
    <Animated.View
      accessibilityRole="tablist"
      style={[
        styles.container,
        {
          bottom: insets.bottom + BAR_MARGIN_BOTTOM,
          shadowColor: colors.shadow,
        },
        animatedContainerStyle,
      ]}
      pointerEvents={keyboardVisible ? 'none' : 'auto'}
    >
      <View style={[styles.opaqueBackground, { backgroundColor: colors.surface }]} />
      {orderedTabs.map((name, visualIdx) => {
        const entry = routeMap.get(name)!;
        const focused = state.index === entry.index;

        const handlePress = () => {
          const event = navigation.emit({
            type: 'tabPress',
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
    position: 'absolute',
    left: BAR_HORIZONTAL_MARGIN,
    right: BAR_HORIZONTAL_MARGIN,
    height: BAR_HEIGHT,
    borderRadius: BAR_BORDER_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  opaqueBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BAR_BORDER_RADIUS,
  },
});
