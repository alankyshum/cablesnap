import { useMemo } from "react";
import { StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";

/**
 * Shared container styles for every Progress-tab segment.
 *
 * Returns a stable `scrollContainer` (for the ScrollView / FlatList `style`)
 * and `contentContainer` (for `contentContainerStyle`) that includes
 * consistent padding and bottom inset to clear the floating tab bar.
 */
export function useSegmentStyles() {
  const tabBarHeight = useFloatingTabBarHeight();

  return useMemo(
    () => ({
      /** Apply to `style` on ScrollView / FlatList */
      scrollContainer: styles.scroll as ViewStyle,
      /** Apply to `contentContainerStyle` — includes bottom padding for tab bar */
      contentContainer: {
        ...styles.content,
        paddingBottom: tabBarHeight + 16,
      } as ViewStyle,
    }),
    [tabBarHeight],
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
});
