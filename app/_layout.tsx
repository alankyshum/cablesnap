import { useColorScheme, Platform } from "react-native";
import { PaperProvider, Banner } from "react-native-paper";
import { ThemeProvider } from "@react-navigation/native";
import { Redirect, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { light, dark, navigationLight, navigationDark } from "../constants/theme";
import { getDatabase, isMemoryFallback, isOnboardingComplete } from "../lib/db";
import { setupGlobalHandler } from "../lib/errors";
import ErrorBoundary from "../components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const paperTheme = isDark ? dark : light;
  const [banner, setBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    getDatabase()
      .then(async () => {
        if (Platform.OS === "web" && isMemoryFallback()) setBanner(true);
        const complete = await isOnboardingComplete();
        setOnboarded(complete);
        setReady(true);
        SplashScreen.hideAsync();
      })
      .catch((err) => {
        setError(err?.message ?? "Failed to initialize database");
        setReady(true);
        SplashScreen.hideAsync();
      });
    setupGlobalHandler();
  }, []);

  const headerStyle = {
    backgroundColor: paperTheme.colors.surface,
  };
  const headerTintColor = paperTheme.colors.onSurface;

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={isDark ? navigationDark : navigationLight}>
          {!onboarded && <Redirect href="/onboarding/welcome" />}
          <Banner
            visible={banner}
            actions={[{ label: "Dismiss", onPress: () => setBanner(false) }]}
            icon="alert-circle-outline"
          >
            Web storage unavailable — using in-memory database. Your data will not persist across page reloads.
          </Banner>
          <Banner
            visible={!!error}
            actions={[{ label: "Retry", onPress: () => { setError(null); getDatabase().catch((e) => setError(e?.message ?? "Retry failed")); } }]}
            icon="alert"
          >
            Database error: {error}. Try reloading the app.
          </Banner>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen
              name="exercise/[id]"
              options={{
                headerShown: true,
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="exercise/create"
              options={{
                headerShown: true,
                title: "New Exercise",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="exercise/edit/[id]"
              options={{
                headerShown: true,
                title: "Edit Exercise",
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
              name="program/[id]"
              options={{
                headerShown: true,
                title: "Program",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="program/create"
              options={{
                headerShown: true,
                title: "New Program",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="program/pick-template"
              options={{
                headerShown: true,
                title: "Pick Template",
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
            <Stack.Screen
              name="session/summary/[id]"
              options={{
                headerShown: true,
                title: "Summary",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="schedule"
              options={{
                headerShown: true,
                title: "Weekly Schedule",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="tools/plates"
              options={{
                headerShown: true,
                title: "Plate Calculator",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="tools/rm"
              options={{
                headerShown: true,
                title: "1RM Calculator",
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
