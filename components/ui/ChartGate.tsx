import { StyleSheet, View, ActivityIndicator } from "react-native";
import { useSkiaWebInit } from "@/hooks/useSkiaWebInit";
import { useThemeColors } from "@/hooks/useThemeColors";

type ChartGateProps = {
  children: React.ReactNode;
};

/**
 * Fail-closed boundary for any `victory-native` / react-native-skia chart.
 *
 * `CartesianChart` reads `CanvasKit.XYWHRect` synchronously at render time, so
 * mounting it before CanvasKit's WASM has loaded on web throws
 * `Cannot read properties of undefined (reading 'XYWHRect')` and trips the app
 * ErrorBoundary (BLD-2078). Wrap the `<CartesianChart>` element with this gate:
 * it mounts `children` only once {@link useSkiaWebInit} reports CanvasKit is
 * genuinely ready, and otherwise renders a centred spinner that fills the
 * already-sized parent `<View>` — so no chart renders early and the surrounding
 * layout (card height, accessibility label on the parent) is preserved.
 *
 * On native this is a passthrough — the hook returns `true` on the first pass,
 * so `children` render with no placeholder flash.
 */
export function ChartGate({ children }: ChartGateProps) {
  const ready = useSkiaWebInit();
  const colors = useThemeColors();

  if (!ready) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.onSurfaceVariant} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
