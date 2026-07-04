import { Stack } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * Route-group layout for every /settings/* screen.
 *
 * Declares the native stack header ONCE for the whole group. The native header
 * owns the top safe-area inset, so content can never collide with the system
 * status bar. This replaces the previous approach of registering each settings
 * route individually in `constants/screen-config.ts` — a route forgotten there
 * (e.g. training-day-macros) inherited the root Stack's `headerShown: false` and
 * rendered with no header, overlapping the status bar. Any screen dropped into
 * app/settings/ now inherits the header automatically.
 *
 * Titles: most screens set their own via an inline `<Stack.Screen options={{ title }} />`
 * (and wizards like macro-coach set per-step titles). The few screens with
 * multi-branch renders that don't self-title declare their title here so it
 * lives in exactly one place per group.
 */
export default function SettingsLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        animation: "none",
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.onSurface,
      }}
    >
      <Stack.Screen name="import-workouts" options={{ title: "Import Workout History" }} />
      <Stack.Screen name="backups" options={{ title: "Backups" }} />
      <Stack.Screen name="import-backup" options={{ title: "Import Backup" }} />
    </Stack>
  );
}
