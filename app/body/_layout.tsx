import { Stack } from "expo-router";
import { useTheme } from "react-native-paper";

export default function BodyLayout() {
  const theme = useTheme();
  const headerStyle = { backgroundColor: theme.colors.surface };
  const headerTintColor = theme.colors.onSurface;

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
