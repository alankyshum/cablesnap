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
      <Stack.Screen name="goals" options={{ title: "Body Goals" }} />
      <Stack.Screen name="measurements" options={{ title: "Log Measurements" }} />
      <Stack.Screen name="photos" options={{ title: "Progress Photos" }} />
      <Stack.Screen name="compare" options={{ title: "Compare Photos" }} />
    </Stack>
  );
}
