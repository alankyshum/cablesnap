import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { light, dark, navigationLight, navigationDark } from "../constants/theme";
import { getDatabase } from "../lib/db";

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const paperTheme = isDark ? dark : light;

  useEffect(() => {
    getDatabase();
  }, []);

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={isDark ? navigationDark : navigationLight}>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="exercise/[id]"
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: paperTheme.colors.surface },
              headerTintColor: paperTheme.colors.onSurface,
            }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </PaperProvider>
  );
}
