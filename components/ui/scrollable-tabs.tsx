/**
 * ScrollableTabs — horizontally scrollable underline tabs.
 *
 * Designed for the Progress route navbar (BLD-849), where 5+ tab labels
 * cannot fit a fixed-width pill SegmentedControl on small phone widths
 * (iPhone SE / 375px) without truncating their text.
 *
 * Visual language: Strava / Apple Fitness / MyFitnessPal — no container
 * background, animated 2px underline beneath the active tab text only,
 * trailing fade gradient that hints at off-screen content and disappears
 * when scrolled to the end.
 *
 * Same prop interface as `SegmentedControl` for trivial swap-in.
 *
 * NOTE: This is a separate component on purpose. SegmentedControl is reused
 * by 15+ screens (settings, onboarding, timer, body profile, exercise form,
 * variant/grip pickers) that rely on `flex: 1` equal-width pill behavior.
 * Forking avoids regressing those callers behind a variant prop.
 */
import { Text } from "@/components/ui/text";
import { useColor } from "@/hooks/useColor";
import { FONT_SIZE, HEIGHT } from "@/theme/globals";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export interface ScrollableTabsButton {
  value: string;
  label: string;
  accessibilityLabel?: string;
}

interface ScrollableTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  buttons: readonly ScrollableTabsButton[] | ScrollableTabsButton[];
  /** Optional outer container style. Tabs handle their own edge padding. */
  style?: ViewStyle;
  /**
   * Horizontal padding flush with the screen edge for the first / last tab
   * via the ScrollView's contentContainerStyle. Defaults to 16.
   */
  edgePadding?: number;
}

/** Width (px) of the trailing fade gradient. */
const FADE_WIDTH = 32;
/** Inner horizontal padding around each tab label. */
const TAB_PADDING_H = 16;
/** Gap between tabs. */
const TAB_GAP = 4;
/** Underline thickness. */
const UNDERLINE_HEIGHT = 2;
/** Animation duration for the underline indicator (ms). */
const INDICATOR_DURATION_MS = 220;

interface TabLayout {
  /** x position of the tab Pressable inside the inner content row. */
  x: number;
  /** Full width of the tab Pressable. */
  width: number;
}

export function ScrollableTabs({
  value,
  onValueChange,
  buttons,
  style,
  edgePadding = 16,
}: ScrollableTabsProps) {
  const activeColor = useColor("primary");
  const inactiveColor = useColor("mutedForeground");
  const bgColor = useColor("background");

  const tabs: readonly ScrollableTabsButton[] = buttons;
  const layoutsRef = useRef<Record<string, TabLayout>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  // Tracks whether we have placed the indicator at least once. Until then the
  // indicator stays width=0 so it does not flash at x=0 before measurement.
  const indicatorReady = useSharedValue(false);

  const scrollRef = useRef<ScrollView>(null);

  const moveIndicatorTo = useCallback(
    (val: string, animate: boolean) => {
      const layout = layoutsRef.current[val];
      if (!layout) return;
      // Underline spans the text label width with a small horizontal inset
      // so it visually sits beneath the text rather than the full padded box.
      const underlineX = layout.x + TAB_PADDING_H;
      const underlineW = Math.max(0, layout.width - TAB_PADDING_H * 2);
      if (animate) {
        indicatorX.value = withTiming(underlineX, {
          duration: INDICATOR_DURATION_MS,
        });
        indicatorW.value = withTiming(underlineW, {
          duration: INDICATOR_DURATION_MS,
        });
      } else {
        indicatorX.value = underlineX;
        indicatorW.value = underlineW;
      }
      indicatorReady.value = true;
    },
    [indicatorReady, indicatorW, indicatorX]
  );

  // Re-position the indicator whenever the active value changes (after
  // initial layout has populated layoutsRef).
  useEffect(() => {
    moveIndicatorTo(value, /* animate */ true);
  }, [value, moveIndicatorTo]);

  const handleTabLayout = useCallback(
    (val: string) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      layoutsRef.current[val] = { x, width };
      // First-paint: snap indicator to the active tab as soon as we have its
      // measurements (no animation — we don't want a slide-in from x=0).
      if (val === value) {
        moveIndicatorTo(val, /* animate */ false);
      }
    },
    [value, moveIndicatorTo]
  );

  const handlePress = useCallback(
    (val: string) => {
      if (val !== value) {
        // Defensive: tests sometimes mock impactAsync as `jest.fn()` which
        // returns undefined rather than a Promise. Don't crash on `.catch`.
        const result = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch(() => {
            // Silently ignore — haptics are a polish, not a correctness path.
          });
        }
      }
      onValueChange(val);
      // Best-effort scroll the new tab into view (centered when possible).
      const layout = layoutsRef.current[val];
      if (layout && containerWidth > 0 && scrollRef.current) {
        const target = Math.max(
          0,
          layout.x + layout.width / 2 - containerWidth / 2
        );
        scrollRef.current.scrollTo({ x: target, animated: true });
      }
    },
    [containerWidth, onValueChange, value]
  );

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const onContentSizeChange = useCallback((w: number) => {
    setContentWidth(w);
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(e.nativeEvent.contentOffset.x);
  }, []);

  // Trailing fade is visible whenever there is content past the right edge.
  // We give a 1px slack to absorb fp rounding on the boundary.
  const trailingFadeVisible =
    contentWidth > containerWidth &&
    scrollX + containerWidth < contentWidth - 1;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
    opacity: indicatorReady.value ? 1 : 0,
  }));

  return (
    <View
      style={[styles.container, style]}
      onLayout={onContainerLayout}
      accessibilityRole="tablist"
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        contentContainerStyle={{
          paddingHorizontal: edgePadding,
          // Inner row holds tabs + the indicator, both share the same x-axis.
          alignItems: "flex-end",
        }}
      >
        <View style={styles.row}>
          {tabs.map((btn) => {
            const isActive = btn.value === value;
            return (
              <Pressable
                key={btn.value}
                onPress={() => handlePress(btn.value)}
                onLayout={handleTabLayout(btn.value)}
                accessibilityRole="tab"
                accessibilityLabel={btn.accessibilityLabel ?? btn.label}
                accessibilityState={{ selected: isActive }}
                style={styles.tab}
                hitSlop={4}
                testID={`scrollable-tab-${btn.value}`}
              >
                <Text
                  style={{
                    fontSize: FONT_SIZE - 2,
                    fontWeight: isActive ? "600" : "400",
                    color: isActive ? activeColor : inactiveColor,
                    textAlign: "center",
                  }}
                  numberOfLines={1}
                  // Ensure the parent Pressable sizes to the natural label
                  // width — RN <Text> does not shrink-to-fit by default
                  // inside a flex row, but our row is not flex-1.
                >
                  {btn.label}
                </Text>
              </Pressable>
            );
          })}
          {/* Animated underline indicator — absolutely positioned at the
              bottom of the row, translates + resizes to follow the active
              tab's text width. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { backgroundColor: activeColor },
              indicatorStyle,
            ]}
            testID="scrollable-tabs-indicator"
          />
        </View>
      </ScrollView>

      {/* Trailing fade gradient — sits above the ScrollView on the right
          edge to suggest "more content beyond the edge". Hidden when the
          user has scrolled to the end. */}
      {trailingFadeVisible && (
        <View
          pointerEvents="none"
          style={[styles.trailingFade, { width: FADE_WIDTH }]}
          testID="scrollable-tabs-trailing-fade"
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={bgColor} stopOpacity="0" />
                <Stop offset="1" stopColor={bgColor} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
          </Svg>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEIGHT,
    // No backgroundColor — sits directly on parent (the screen background).
    // This is the key visual differentiator from SegmentedControl.
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: HEIGHT,
    gap: TAB_GAP,
    // The row is the positioning context for the absolute indicator.
    position: "relative",
  },
  tab: {
    height: HEIGHT,
    paddingHorizontal: TAB_PADDING_H,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: UNDERLINE_HEIGHT,
    borderRadius: 1,
  },
  trailingFade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
  },
});
