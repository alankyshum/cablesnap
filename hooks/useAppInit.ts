import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { getDatabase, isMemoryFallback, isOnboardingComplete } from "../lib/db";
import { setupGlobalHandler } from "../lib/errors";
import { detectWebSharedMemorySupport, WEB_UNSUPPORTED_MESSAGE } from "../lib/web-support";

// BLD-565: On web, drizzle-orm/expo-sqlite calls prepareSync/executeSync
// which internally uses `new SharedArrayBuffer(…)`.  Without a
// cross-origin-isolated host (real COOP + COEP response headers), SAB
// is undefined and the first query throws
// `ReferenceError: SharedArrayBuffer is not defined`.  We detect this
// up-front and skip DB init so the user sees a readable banner instead
// of a blank screen + uncaught ReferenceError in Sentry.
function webNeedsUnsupportedFallback(): boolean {
  if (Platform.OS !== "web") return false;
  return !detectWebSharedMemorySupport().supported;
}

export function useAppInit() {
  // Capability is a property of the JS runtime + document isolation
  // state; it does not change across re-renders for a given session,
  // so evaluate once and reuse.
  const unsupportedWeb = useMemo(() => webNeedsUnsupportedFallback(), []);

  const [banner, setBanner] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    unsupportedWeb ? WEB_UNSUPPORTED_MESSAGE : null
  );
  const [ready, setReady] = useState<boolean>(() => unsupportedWeb);
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    if (unsupportedWeb) {
      SplashScreen.hideAsync();
      return;
    }

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

        // Visual-UX-audit scenario seed (dev + web + __TEST_SCENARIO__ only).
        // Wrapped in `if (__DEV__)` so Metro strips the dynamic import and the
        // `__TEST_SCENARIO__` string from production bundles — enforced by
        // `scripts/verify-scenario-hook-not-in-bundle.sh`.
        if (__DEV__) {
          try {
            const { seedScenario } = await import("../lib/db/test-seed");
            await seedScenario();
          } catch (err) {
            console.warn("[test-seed] scenario seed failed:", err);
          }
        }

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
  }, [unsupportedWeb]);

  return { banner, setBanner, error, setError, ready, onboarded, setOnboarded };
}
