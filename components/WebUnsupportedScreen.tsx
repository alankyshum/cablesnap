import { View, Text, StyleSheet } from "react-native";
import { Colors } from "@/theme/colors";

type Props = {
  message: string;
  themeColors: typeof Colors.light;
};

/**
 * Fullscreen fallback rendered on web when the host is not
 * cross-origin isolated (i.e. `SharedArrayBuffer` / `crossOriginIsolated`
 * are not available).  This is rendered INSTEAD of the normal
 * <QueryProvider>/<Stack> tree so that no downstream effect, query, or
 * event handler can reach drizzle-orm/expo-sqlite's sync API and
 * trigger `ReferenceError: SharedArrayBuffer is not defined`.
 *
 * Intentionally:
 *  - contains no interactive elements that could invoke the DB;
 *  - does not mount QueryProvider or Stack;
 *  - does not render LayoutBanners (whose Retry would re-invoke getDatabase).
 *
 * See BLD-565.
 */
export function WebUnsupportedScreen({ message, themeColors }: Props) {
  return (
    <View
      testID="web-unsupported-screen"
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <View style={[styles.card, { backgroundColor: themeColors.card }]}>
        <Text style={[styles.title, { color: themeColors.foreground }]}>
          Web build unavailable
        </Text>
        <Text style={[styles.body, { color: themeColors.foreground }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    maxWidth: 560,
    padding: 24,
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
