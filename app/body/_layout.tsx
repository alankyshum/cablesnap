import { t } from "@lingui/core/macro";
import { Stack } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function BodyLayout() {
  const colors = useThemeColors();
  const headerStyle = { backgroundColor: colors.surface };
  const headerTintColor = colors.onSurface;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle,
        headerTintColor,
      }}
    >
      <Stack.Screen name="goals" options={{ title: t({ id: "body.layout.goals.title", message: "Body Goals" }) }} />
      <Stack.Screen name="measurements" options={{ title: t({ id: "body.layout.measurements.title", message: "Log Measurements" }) }} />
      <Stack.Screen name="photos" options={{ title: t({ id: "body.layout.photos.title", message: "Progress Photos" }) }} />
      <Stack.Screen name="compare" options={{ title: t({ id: "body.layout.compare.title", message: "Compare Photos" }) }} />
    </Stack>
  );
}
