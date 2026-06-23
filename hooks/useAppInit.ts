import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { getDatabase, isMemoryFallback, isOnboardingComplete } from "../lib/db";
import { setupGlobalHandler } from "../lib/errors";
import { detectWebSharedMemorySupport, WEB_UNSUPPORTED_MESSAGE } from "../lib/web-support";
import { excludeFormClipsFromBackup } from "../lib/media/backup-exclusion";

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

// BLD-1796: dev/test-only. Load the lazy `test-seed` chunk and run the scenario
// seed, retrying the DYNAMIC IMPORT on a transient "Failed to fetch" (the chunk
// dropped by the shared `npx serve` static origin under N concurrently
// cold-booting Playwright workers). A rejected dynamic import is not cached, so
// re-`import()`ing genuinely re-fetches the chunk. Once the module is loaded,
// `runScenarioSeedWithRetry` owns the (also-bounded) retry of `seedScenario()`
// itself — that covers the "Sync operation timeout" class on the seed's drizzle
// writes. Both retries are inert outside WebDriver (single attempt), and this
// whole helper is only reached from an `if (__DEV__)` block, so production is
// untouched. Kept thin and self-contained: its loop must NOT depend on the lazy
// module it is trying to load.
const SEED_IMPORT_MAX_ATTEMPTS = 5;
const SEED_IMPORT_RETRY_BACKOFF_MS = 150;

function seedImportRetryEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { webdriver?: boolean };
  return nav.webdriver === true;
}

async function runScenarioSeedWithImportRetry(): Promise<void> {
  const maxAttempts = seedImportRetryEnabled() ? SEED_IMPORT_MAX_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const mod = await import("../lib/db/test-seed");
      // Module loaded — delegate to its bounded seedScenario retry (handles the
      // "Sync operation timeout" class). A non-transient seed error throws out.
      await mod.runScenarioSeedWithRetry(() => mod.seedScenario());
      return;
    } catch (err) {
      const isFetchFailure =
        err instanceof Error &&
        (err.message.includes("Failed to fetch") ||
          err.message.includes("Load failed") ||
          err.message.includes("NetworkError"));
      // Only the IMPORT failure is handled here; once `mod` loaded,
      // runScenarioSeedWithRetry has already classified/rethrown seed errors, so
      // any error reaching here after a successful import is non-transient.
      if (attempt === maxAttempts || !isFetchFailure) throw err;
      // eslint-disable-next-line no-console
      console.warn(
        `[test-seed] transient test-seed import failure (attempt ${attempt}/${maxAttempts}), retrying:`,
        err.message,
      );
      await new Promise((resolve) => setTimeout(resolve, SEED_IMPORT_RETRY_BACKOFF_MS));
    }
  }
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
  // BLD-1092: null = pending, true = excluded, false = exclusion failed
  const [backupExclusionOk, setBackupExclusionOk] = useState<boolean | null>(null);

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
          // BLD-1796: under Playwright (navigator.webdriver) the lazy import +
          // seed is retried on transient failures — "Failed to fetch" (the lazy
          // `test-seed` chunk dropped by the shared `npx serve` static origin
          // under N concurrently cold-booting workers) and "Sync operation
          // timeout" (the seed's drizzle writes hitting the BLD-1636 sync
          // busy-wait budget on a still-contended worker). Both otherwise leave
          // `data-test-ready` unset and flake every seed-dependent scenario spec
          // at high worker counts. The retry loop wraps the dynamic import
          // itself, because a REJECTED dynamic import is not cached — a retry
          // genuinely re-fetches the chunk. Outside WebDriver this is a single
          // attempt (no behavior change); the whole block is dev-only, so
          // production is untouched. `seedScenario()` is idempotent
          // (DELETE-then-reinsert fixed-id rows), so re-running it is safe.
          try {
            await runScenarioSeedWithImportRetry();
          } catch (err) {
            console.warn("[test-seed] scenario seed failed:", err);
            // Surface seed errors in E2E test runs so error-context snapshots capture the cause.
            if (typeof document !== "undefined" && document.body) {
              document.body.dataset.testSeedError =
                err instanceof Error ? err.message : String(err);
            }
          }
        }

        // Strava retry reconciliation on startup (non-blocking)
        if (Platform.OS !== "web") {
          import("../lib/strava")
            .then(({ reconcileStravaQueue }) => reconcileStravaQueue())
            .catch((err) => console.error("Strava queue reconciliation failed:", err));
        }

        // Form-clips orphan reconciliation on startup (non-blocking, iOS + Android).
        if (Platform.OS !== "web") {
          import("../lib/media/form-clips")
            .then(({ reconcileOrphans }) => reconcileOrphans())
            .catch((err) => console.error("Form-clips orphan reconciliation failed:", err));
        }

        // BLD-1092: Ensure form-clips/ is excluded from iCloud/Auto Backup.
        // Result is stored in state so FormVideoSheet can gate the strong privacy banner.
        if (Platform.OS !== "web") {
          excludeFormClipsFromBackup()
            .then(({ ok }) => setBackupExclusionOk(ok))
            .catch(() => setBackupExclusionOk(false));
        } else {
          // Web: form clips not supported — treat as ok=true (no backup concern).
          setBackupExclusionOk(true);
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

  return { banner, setBanner, error, setError, ready, onboarded, setOnboarded, webUnsupported: unsupportedWeb, backupExclusionOk };
}
