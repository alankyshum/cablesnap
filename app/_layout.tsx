import "react-native-reanimated";

// Reanimated 4 performance flags for New Architecture on Android
(global as Record<string, unknown>)._reanimatedFeatureFlags = {
  ...((global as Record<string, unknown>)._reanimatedFeatureFlags as Record<string, boolean> ?? {}),
  ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: true,
  USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS: true,
};

import { useColorScheme, Platform, AppState, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from "react-native-paper";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { BNAThemeProvider } from "../theme/theme-provider";
import { ToastProvider, useToast } from "../components/ui/bna-toast";
import { Colors } from "../theme/colors";

import { getDatabase, isMemoryFallback, isOnboardingComplete, getAppSetting, setAppSetting } from "../lib/db";
import { setupGlobalHandler } from "../lib/errors";
import { setupConsoleLogBuffer } from "../lib/console-log-buffer";
import { log as logInteraction } from "../lib/interactions";
import { setupHandler, handleResponse, getPermissionStatus, addNotificationResponseReceivedListener } from "../lib/notifications";
import ErrorBoundary from "../components/ErrorBoundary";
import { QueryProvider } from "../lib/query";
import { OnboardingContext } from "../lib/onboarding-context";

SplashScreen.preventAutoHideAsync();
setupHandler();
setupConsoleLogBuffer();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const themeColors = isDark ? Colors.dark : Colors.light;
  const [banner, setBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
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
        // Allow e2e tests to bypass onboarding via window flag
        const skipOnboarding =
          Platform.OS === "web" &&
          typeof window !== "undefined" &&
          (window as unknown as Record<string, unknown>).__SKIP_ONBOARDING__ === true;
        const complete = skipOnboarding || (await isOnboardingComplete());
        setOnboarded(complete);

        // Strava retry reconciliation on startup (non-blocking)
        if (Platform.OS !== "web") {
          import("../lib/strava")
            .then(({ reconcileStravaQueue }) => reconcileStravaQueue())
            .catch((err) => console.error("Strava queue reconciliation failed:", err));
        }

        // Health Connect retry reconciliation on startup (non-blocking, Android only)
        if (Platform.OS === "android") {
          import("../lib/health-connect")
            .then(({ reconcileHealthConnectQueue }) => reconcileHealthConnectQueue())
            .catch((err) => console.error("Health Connect queue reconciliation failed:", err));
        }

        setReady(true);
        SplashScreen.hideAsync();
      })
      .catch((err) => {
        const msg = typeof err === "string" ? err : err?.message ?? "Failed to initialize database";
        setError(msg || "Unknown error");
        setReady(true);
        SplashScreen.hideAsync();
      });
    setupGlobalHandler();
  }, []);

  const headerStyle = {
    backgroundColor: themeColors.card,
  };
  const headerTintColor = themeColors.foreground;

  const completeOnboarding = useCallback(() => setOnboarded(true), []);
  const onboardingCtx = useMemo(
    () => ({ completeOnboarding }),
    [completeOnboarding]
  );

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
      <QueryProvider>
      <OnboardingContext.Provider value={onboardingCtx}>
      <BNAThemeProvider>
      <PaperProvider theme={isDark ? MD3DarkTheme : MD3LightTheme}>
        <ToastProvider>
          <LayoutToastBridge />
          {!onboarded && !pathname.startsWith("/onboarding") && (
            <Redirect href="/onboarding/welcome" />
          )}
          {banner && (
          <View style={{ backgroundColor: isDark ? "#332200" : "#FFF8E1", padding: 16 }}>
            <Text style={{ color: themeColors.foreground }}>
              ⚠️ Web storage unavailable — using in-memory database. Your data will not persist across page reloads.
            </Text>
            <Text
              style={{ color: themeColors.primary, marginTop: 8, fontWeight: "600" }}
              onPress={() => setBanner(false)}
            >
              Dismiss
            </Text>
          </View>
          )}
          {!!error && (
          <View style={{ backgroundColor: isDark ? "#3B1111" : "#FEE2E2", padding: 16 }}>
            <Text style={{ color: themeColors.foreground }}>
              ❌ Database error: {error}. Try reloading the app.
            </Text>
            <Text
              style={{ color: themeColors.primary, marginTop: 8, fontWeight: "600" }}
              onPress={() => { setError(null); getDatabase().catch((e) => setError(e?.message ?? "Retry failed")); }}
            >
              Retry
            </Text>
          </View>
          )}
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "fade_from_bottom",
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
                presentation: "modal",
                animation: "slide_from_bottom",
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
                presentation: "modal",
                animation: "slide_from_bottom",
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
                presentation: "modal",
                animation: "slide_from_bottom",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="nutrition/targets"
              options={{
                headerShown: true,
                title: "Macro Targets",
                presentation: "modal",
                animation: "slide_from_bottom",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="nutrition/profile"
              options={{
                headerShown: true,
                title: "Nutrition Profile",
                presentation: "modal",
                animation: "slide_from_bottom",
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
              name="body"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="progress"
              options={{
                headerShown: false,
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
              name="settings/import-strong"
              options={{
                headerShown: true,
                title: "Import from Strong",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="settings/import-backup"
              options={{
                headerShown: true,
                title: "Import Backup",
                headerStyle,
                headerTintColor,
              }}
            />
            <Stack.Screen
              name="tools/index"
              options={{
                headerShown: true,
                title: "Workout Tools",
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
        </ToastProvider>
      </PaperProvider>
      </BNAThemeProvider>
      </OnboardingContext.Provider>
      </QueryProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

/** Bridges notification/permission events to BNA toast (must be inside ToastProvider) */
function LayoutToastBridge() {
  const { info, warning } = useToast();
  const router = useRouter();

  useEffect(() => {
    const sub = addNotificationResponseReceivedListener((response) => {
      handleResponse(
        response,
        (path, params) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Expo Router dynamic route type
          if (params) router.push({ pathname: path as any, params });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          else router.push(path as any);
        },
        (msg: string) => info(msg)
      );
    });
    return () => sub?.remove();
  }, [router, info]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        const status = await getPermissionStatus();
        if (status !== "granted") {
          const enabled = await getAppSetting("reminders_enabled");
          if (enabled === "true") {
            await setAppSetting("reminders_enabled", "false");
            warning("Notification permission was revoked. Reminders disabled.");
          }
        }
      } catch {
        // Permission check failed — non-critical background operation
      }
    });
    return () => sub.remove();
  }, [warning]);

  return null;
}
