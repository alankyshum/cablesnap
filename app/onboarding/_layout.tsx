import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="recommend" />
    </Stack>
  );
}
