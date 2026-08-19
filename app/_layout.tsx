import "react-native-reanimated";

// Reanimated 4 performance flags for New Architecture on Android
(global as Record<string, unknown>)._reanimatedFeatureFlags = {
  ...((global as Record<string, unknown>)._reanimatedFeatureFlags as Record<string, boolean> ?? {}),
  ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: true,
  USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS: true,
};

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Redirect, Stack, usePathname } from "expo-router";
import Constants from "expo-constants";
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
import { setupHandler, ensureRestChannelsRegistered } from "../lib/notifications";
import ErrorBoundary from "../components/ErrorBoundary";
import { QueryProvider } from "../lib/query";
import { OnboardingContext } from "../lib/onboarding-context";
import { FormClipsContext } from "../lib/form-clips-context";
import { useAppInit } from "../hooks/useAppInit";
import { SCREEN_CONFIGS } from "../constants/screen-config";
import { LayoutToastBridge } from "../components/LayoutToastBridge";
import { UpdatePromptBridge } from "../components/UpdatePromptBridge";
import { LayoutBanners } from "../components/LayoutBanners";
import { WebUnsupportedScreen } from "../components/WebUnsupportedScreen";
import { DatabaseUnavailableScreen } from "../components/DatabaseUnavailableScreen";
import { useDatabaseStatus } from "../hooks/useDatabaseStatus";
import { WEB_UNSUPPORTED_MESSAGE } from "../lib/web-support";
import * as Sentry from '@sentry/react-native';
import { mediaSurfaceMountCount } from '@/lib/media/replay-gate';
import { filterLocalhostEvents } from '@/lib/sentry-localhost-filter';
import { redactSentryBreadcrumb } from '@/lib/ai/redact';
import { isSentryEnabled, resolveSentryDsn } from '@/lib/sentry-enabled';

const sentryEnabled = isSentryEnabled(Constants.expoConfig?.extra);
const sentryDsn = resolveSentryDsn(Constants.expoConfig?.extra);

Sentry.init({
  enabled: sentryEnabled,
  ...(sentryEnabled && sentryDsn ? { dsn: sentryDsn } : {}),
  enableNative: sentryEnabled,
  autoInitializeNativeSdk: sentryEnabled,
  enableNativeCrashHandling: sentryEnabled,
  enableAutoSessionTracking: sentryEnabled,
  sendDefaultPii: true,
  enableLogs: true,
  // BLD-2446: Drop CI/dev events (localhost/127.0.0.1/0.0.0.0). Fail-open on missing/unparseable url tag.
  beforeSend: filterLocalhostEvents,
  beforeBreadcrumb: redactSentryBreadcrumb,
  // AC12 (BLD-1092): no session-sampled replay; error replays remain. See PLAN-BLD-1092.md §Privacy.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration({
    maskAllImages: true,
    maskAllVectors: true,
    // Skip error-replay while any media surface is mounted (replay-gate.ts).
    beforeErrorSampling: () => mediaSurfaceMountCount() === 0,
  })],
});

SplashScreen.preventAutoHideAsync();
setupHandler();
ensureRestChannelsRegistered(); // BLD-1137: register REST_ONGOING_CHANNEL + REST_CUE_CHANNEL on Android
setupConsoleLogBuffer();
// BLD-1092: excludeFormClipsFromBackup() is now called inside useAppInit()
// so the result can be tracked in React state and passed to FormVideoSheet
// via FormClipsContext to gate the strong privacy banner.

export default Sentry.wrap(function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const themeColors = isDark ? Colors.dark : Colors.light;
  const { banner, setBanner, error, setError, ready, onboarded, setOnboarded, webUnsupported, backupExclusionOk } = useAppInit();
  // BLD-1257 / BLD-1262: gate the entire app on DB availability, parallel
  // to the existing webUnsupported gate. We pass `disabled: webUnsupported`
  // so the hook is a no-op on web hosts that lack SharedArrayBuffer —
  // otherwise its useEffect would still call getDatabase() after the
  // WebUnsupportedScreen render, re-introducing the BLD-565
  // `ReferenceError: SharedArrayBuffer is not defined` regression.
  const dbStatus = useDatabaseStatus({ disabled: webUnsupported });
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
  const formClipsCtx = useMemo(() => ({ backupExclusionOk }), [backupExclusionOk]);

  if (!ready) return null;

  // BLD-565: on a web host without cross-origin isolation, drizzle's
  // sync API will throw `ReferenceError: SharedArrayBuffer is not
  // defined` on the first query.  Render a fullscreen fallback
  // INSTEAD of the normal tree so that no child effect / event
  // handler can reach the DB.
  if (webUnsupported) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <WebUnsupportedScreen message={WEB_UNSUPPORTED_MESSAGE} themeColors={themeColors} />
        <StatusBar style="auto" />
      </GestureHandlerRootView>
    );
  }

  // BLD-1257: native DB init failure — render the recovery surface in
  // place of the normal tree. Web failures fall through to the existing
  // LayoutBanners path (memory fallback or banner-only).
  if (dbStatus.kind === "unavailable") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <DatabaseUnavailableScreen
            error={dbStatus.error}
            sentryEventId={dbStatus.sentryEventId}
            onRetry={dbStatus.retry}
          />
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  const headerStyle = { backgroundColor: themeColors.card };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
    <ErrorBoundary>
      <QueryProvider>
      <OnboardingContext.Provider value={onboardingCtx}>
      <FormClipsContext.Provider value={formClipsCtx}>
      <ThemePreferenceProvider>
      <BNAThemeProvider>
        <ToastProvider>
          <BottomSheetModalProvider>
          <LayoutToastBridge />
          <UpdatePromptBridge />
          {!onboarded && !pathname.startsWith("/onboarding") && (
            <Redirect href="/onboarding/welcome" />
          )}
          <LayoutBanners banner={banner} setBanner={setBanner} error={error} setError={setError} themeColors={themeColors} />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "none",
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
          </BottomSheetModalProvider>
        </ToastProvider>
      </BNAThemeProvider>
      </ThemePreferenceProvider>
      </FormClipsContext.Provider>
      </OnboardingContext.Provider>
      </QueryProvider>
    </ErrorBoundary>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});
