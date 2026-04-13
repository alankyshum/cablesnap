import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { light, dark, navigationLight, navigationDark } from "../constants/theme";
import { getDatabase } from "../lib/db";
import { setupGlobalHandler } from "../lib/errors";
import ErrorBoundary from "../components/ErrorBoundary";

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const paperTheme = isDark ? dark : light;

  useEffect(() => {
    getDatabase();
    setupGlobalHandler();
  }, []);

  const headerStyle = {
    backgroundColor: paperTheme.colors.surface,
  };
  const headerTintColor = paperTheme.colors.onSurface;

  return (
    <ErrorBoundary>
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
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="template/create"
              options={{
                headerShown: true,
                title: "New Template",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="template/[id]"
              options={{
                headerShown: true,
                title: "Edit Template",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="template/pick-exercise"
              options={{
                headerShown: true,
                title: "Pick Exercise",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="session/[id]"
              options={{
                headerShown: true,
                title: "Workout",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="session/detail/[id]"
              options={{
                headerShown: true,
                title: "Workout Summary",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="nutrition/add"
              options={{
                headerShown: true,
                title: "Add Food",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="nutrition/targets"
              options={{
                headerShown: true,
                title: "Macro Targets",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="errors"
              options={{
                headerShown: true,
                title: "Error Log",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="body/measurements"
              options={{
                headerShown: true,
                title: "Log Measurements",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="body/goals"
              options={{
                headerShown: true,
                title: "Body Goals",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="history"
              options={{
                headerShown: true,
                title: "Workout History",
                headerStyle,
                headerTintColor,
              }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </PaperProvider>
    </ErrorBoundary>
  );
}
