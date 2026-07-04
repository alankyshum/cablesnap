import { Stack } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * Route-group layout for every /nutrition/* screen.
 *
 * Declares the native stack header once for the whole group so each screen sets
 * only its own title (and optional headerRight action) via `<Stack.Screen>`.
 * The native header owns the top safe-area inset and the back button, replacing
 * the previous hand-rolled `headerRow` View that had no top inset and collided
 * with the system status bar. New screens dropped into app/nutrition/ inherit
 * the header automatically \u2014 no per-route registration to maintain.
 */
export default function NutritionLayout() {
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
