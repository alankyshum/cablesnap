import "react-native-reanimated";

// Reanimated 4 performance flags for New Architecture on Android
(global as Record<string, unknown>)._reanimatedFeatureFlags = {
  ...((global as Record<string, unknown>)._reanimatedFeatureFlags as Record<string, boolean> ?? {}),
  ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: true,
  USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS: true,
};

import { useColorScheme, AppState, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as SplashScreen from "expo-splash-screen";
import { BNAThemeProvider } from "../theme/theme-provider";
import { ToastProvider, useToast } from "../components/ui/bna-toast";
import { Colors } from "../theme/colors";

import { getDatabase, getAppSetting, setAppSetting } from "../lib/db";
import { setupConsoleLogBuffer } from "../lib/console-log-buffer";
import { log as logInteraction } from "../lib/interactions";
import { setupHandler, handleResponse, getPermissionStatus, addNotificationResponseReceivedListener } from "../lib/notifications";
import ErrorBoundary from "../components/ErrorBoundary";
import { QueryProvider } from "../lib/query";
import { OnboardingContext } from "../lib/onboarding-context";
import { useAppInit } from "../hooks/useAppInit";
import { SCREEN_CONFIGS } from "./screen-config";

SplashScreen.preventAutoHideAsync();
setupHandler();
setupConsoleLogBuffer();

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const themeColors = isDark ? Colors.dark : Colors.light;
  const { banner, setBanner, error, setError, ready, onboarded, setOnboarded } = useAppInit();
  const pathname = usePathname();
  const prev = useRef(pathname);

  useEffect(() => {
    if (!ready) return;
    if (pathname !== prev.current) {
      prev.current = pathname;
      logInteraction("navigate", pathname);
    }
  }, [pathname, ready]);

  const headerStyle = {
    backgroundColor: themeColors.card,
  };
  const headerTintColor = themeColors.foreground;

  const completeOnboarding = useCallback(() => setOnboarded(true), [setOnboarded]);
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
        <ToastProvider>
          <LayoutToastBridge />
          {!onboarded && !pathname.startsWith("/onboarding") && (
            <Redirect href="/onboarding/welcome" />
          )}
          {banner && (
          <View style={{ backgroundColor: themeColors.warningBanner, padding: 16 }}>
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
          <View style={{ backgroundColor: themeColors.errorBanner, padding: 16 }}>
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
            {SCREEN_CONFIGS.map(({ name, options }) => (
              <Stack.Screen
                key={name}
                name={name}
                options={{
                  ...options,
                  ...(options.headerShown ? { headerStyle, headerTintColor } : {}),
                }}
              />
            ))}
          </Stack>
          <StatusBar style="auto" />
        </ToastProvider>
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
