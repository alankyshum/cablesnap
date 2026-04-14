import { useColorScheme, Platform, AppState } from "react-native";
import { PaperProvider, Banner, Snackbar } from "react-native-paper";
import { ThemeProvider } from "@react-navigation/native";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { light, dark, navigationLight, navigationDark } from "../constants/theme";
import { getDatabase, isMemoryFallback, isOnboardingComplete, getAppSetting, setAppSetting } from "../lib/db";
import { setupGlobalHandler } from "../lib/errors";
import { log as logInteraction } from "../lib/interactions";
import { setupHandler, handleResponse, getPermissionStatus } from "../lib/notifications";
import ErrorBoundary from "../components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();
setupHandler();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const paperTheme = isDark ? dark : light;
  const router = useRouter();
  const [banner, setBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const [snack, setSnack] = useState("");
  const pathname = usePathname();
  const prev = useRef(pathname);

  useEffect(() => {
    if (!ready) return;
    if (pathname !== prev.current) {
      prev.current = pathname;
      logInteraction("navigate", pathname);
    }
  }, [pathname, ready]);

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

  // Notification tap handler
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(
        response,
        (path, params) => {
          if (params) router.push({ pathname: path as any, params });
          else router.push(path as any);
        },
        setSnack
      );
    });
    return () => sub.remove();
  }, [router]);

  // Permission re-check on app foreground
  // Cleanup via sub.remove() — modern RN equivalent of removeEventListener
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        const status = await getPermissionStatus();
        if (status !== "granted") {
          const enabled = await getAppSetting("reminders_enabled");
          if (enabled === "true") {
            await setAppSetting("reminders_enabled", "false");
            setSnack("Notification permission was revoked. Reminders disabled.");
          }
        }
      } catch {
        // Permission check failed — non-critical background operation
      }
    });
    return () => sub.remove();
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
              name="feedback"
              options={{
                headerShown: true,
                title: "Feedback & Reports",
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
              name="schedule/index"
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
            <Stack.Screen
              name="tools/timer"
              options={{
                headerShown: true,
                title: "Interval Timer",
                headerStyle,
                headerTintColor,
              }}
            />
          </Stack>
          <StatusBar style="auto" />
          <Snackbar
            visible={!!snack}
            onDismiss={() => setSnack("")}
            duration={3000}
            accessibilityLiveRegion="polite"
            action={{ label: "OK", onPress: () => setSnack("") }}
          >
            {snack}
          </Snackbar>
        </ThemeProvider>
      </PaperProvider>
    </ErrorBoundary>
  );
}
