import { Stack } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * Route-group layout for every /tools/* screen.
 *
 * Declares the native stack header once for the whole group (title comes from
 * each screen's own `<Stack.Screen options={{ title }} />`). The native header
 * owns the top safe-area inset, so screens dropped into app/tools/ never overlap
 * the system status bar and need no central screen-config registration.
 */
export default function ToolsLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        animation: "none",
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.onSurface,
      }}
    />
  );
}
