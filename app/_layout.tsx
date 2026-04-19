import "react-native-reanimated";

// Reanimated 4 performance flags for New Architecture on Android
(global as Record<string, unknown>)._reanimatedFeatureFlags = {
  ...((global as Record<string, unknown>)._reanimatedFeatureFlags as Record<string, boolean> ?? {}),
  ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: true,
  USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS: true,
};

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Redirect, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as SplashScreen from "expo-splash-screen";
import { BNAThemeProvider } from "../theme/theme-provider";
import { ToastProvider } from "../components/ui/bna-toast";
import { Colors } from "../theme/colors";
import { ThemePreferenceProvider } from "../lib/theme-preference";
import { useColorScheme } from "@/hooks/useColorScheme";

import { setupConsoleLogBuffer } from "../lib/console-log-buffer";
import { log as logInteraction } from "../lib/interactions";
import { setupHandler } from "../lib/notifications";
import ErrorBoundary from "../components/ErrorBoundary";
import { QueryProvider } from "../lib/query";
import { OnboardingContext } from "../lib/onboarding-context";
import { useAppInit } from "../hooks/useAppInit";
import { SCREEN_CONFIGS } from "./screen-config";
import { LayoutToastBridge } from "../components/LayoutToastBridge";
import { LayoutBanners } from "../components/LayoutBanners";

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

  const completeOnboarding = useCallback(() => setOnboarded(true), [setOnboarded]);
  const onboardingCtx = useMemo(
    () => ({ completeOnboarding }),
    [completeOnboarding]
  );

  if (!ready) return null;

  const headerStyle = { backgroundColor: themeColors.card };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
      <QueryProvider>
      <OnboardingContext.Provider value={onboardingCtx}>
      <ThemePreferenceProvider>
      <BNAThemeProvider>
        <ToastProvider>
          <LayoutToastBridge />
          {!onboarded && !pathname.startsWith("/onboarding") && (
            <Redirect href="/onboarding/welcome" />
          )}
          <LayoutBanners banner={banner} setBanner={setBanner} error={error} setError={setError} themeColors={themeColors} />
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
                  ...(options.headerShown ? { headerStyle, headerTintColor: themeColors.foreground } : {}),
                }}
              />
            ))}
          </Stack>
          <StatusBar style="auto" />
        </ToastProvider>
      </BNAThemeProvider>
      </ThemePreferenceProvider>
      </OnboardingContext.Provider>
      </QueryProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

