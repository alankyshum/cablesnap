import { Alert, Linking } from "react-native";
import * as Sentry from "@sentry/react-native";

/**
 * Build a YouTube search URL for "<exercise name> form tutorial".
 * Returns null for empty / whitespace-only names.
 */
export function buildTutorialSearchUrl(name: string): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  const query = `${trimmed} form tutorial`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function tutorialBreadcrumb(
  message: "open" | "open_failed",
  data: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category: "exercise.tutorial",
    message,
    level: message === "open_failed" ? "warning" : "info",
    data,
  });
}

// Module-level in-flight guard. Single source of truth across all consumers
// (ExerciseDetailPane + ExerciseDetailDrawer). Resets in finally.
let inFlight: Promise<void> | null = null;

export interface OpenTutorialOptions {
  onError?: (error: unknown, url: string) => void;
}

/**
 * Open a YouTube search for `"<name> form tutorial"` in the system browser.
 *
 * - Guarded by a module-level Promise so double-tap (and parallel taps
 *   from Pane + Drawer) is a no-op.
 * - Emits a Sentry breadcrumb on success (`exercise.tutorial` / `open`)
 *   and on failure (`exercise.tutorial` / `open_failed`).
 * - Shows an Alert with the URL for manual copy when `canOpenURL` returns
 *   false or `openURL` throws. Override via `opts.onError`.
 */
export async function openTutorialForExercise(
  name: string,
  opts: OpenTutorialOptions = {},
): Promise<void> {
  if (inFlight) return inFlight;

  const url = buildTutorialSearchUrl(name);
  if (!url) return;

  const exerciseName = name.trim();

  const task = (async () => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        throw new Error("Linking.canOpenURL returned false");
      }
      await Linking.openURL(url);
      tutorialBreadcrumb("open", { exerciseName });
    } catch (e) {
      tutorialBreadcrumb("open_failed", {
        exerciseName,
        error: String(e),
      });
      if (opts.onError) {
        opts.onError(e, url);
      } else {
        Alert.alert(
          "Couldn't open browser",
          `Copy this link to search manually:\n\n${url}`,
        );
      }
    }
  })();

  inFlight = task.finally(() => {
    inFlight = null;
  });

  return inFlight;
}

// Test-only helper to reset the in-flight lock between tests.
export function __resetTutorialLinkLockForTests(): void {
  inFlight = null;
}
