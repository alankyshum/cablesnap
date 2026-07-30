import React from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * F-Droid chart stub — renders a clear "Charts unavailable in this build" placeholder.
 *
 * This module is resolved by Metro (via metro.config.js resolver alias) when
 * CABLESNAP_FDROID=1, replacing victory-native and @shopify/react-native-skia.
 * It provides the same named exports so importing components don't need changes.
 */

// Use a simple View as the CartesianChart replacement — children are ignored
// because the chart content itself is unavailable. We render a centered message.
export function CartesianChart({ style }: { style?: object; children?: React.ReactNode; [key: string]: unknown }) {
  return (
    <View style={[styles.chartContainer, style]}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText} accessibilityLabel="Charts unavailable in this build">
          Charts unavailable in this build
        </Text>
        <Text style={styles.placeholderSubtext}>
          The F-Droid build excludes chart rendering libraries to avoid proprietary
          dependencies and native compilation. All other features work normally.
        </Text>
      </View>
    </View>
  );
}

// Line, Bar, Scatter are no-ops — they're only used as CartesianChart children
export const Line = () => null;
export const Bar = () => null;
export const Scatter = () => null;

// matchFont returns null (graceful fallback — consumers already handle null)
export function matchFont(): null {
  return null;
}

const styles = StyleSheet.create({
  chartContainer: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  placeholderText: {
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "600",
  },
  placeholderSubtext: {
    textAlign: "center",
    opacity: 0.7,
  },
});
