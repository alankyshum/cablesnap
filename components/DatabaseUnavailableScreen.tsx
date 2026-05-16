import { Appearance, Share, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { RotateCcw, Share2 } from "lucide-react-native";
import { Colors } from "@/theme/colors";
import { fontSizes } from "@/constants/design-tokens";
import type { DatabaseUnavailableError } from "@/lib/db";
import {
  getRecentConsoleLogs,
  formatConsoleLogs,
} from "@/lib/console-log-buffer";

type Props = {
  error: DatabaseUnavailableError;
  sentryEventId?: string;
  onRetry: () => void;
};

// BLD-1257 (QD requirement #4): exposed as a pure helper so the breadcrumb
// tail accompanying the Sentry event id is testable without invoking the
// native Share dialog. Recent console-log buffer is the local proxy for the
// Sentry breadcrumb stream (Sentry breadcrumbs are write-only from JS, so
// we attach the buffered console output which captures the same db.* / nav
// events that feed Sentry).
export function buildDatabaseDiagnostics(
  error: DatabaseUnavailableError,
  sentryEventId: string | undefined,
  now: Date = new Date(),
): string {
  const lines = [
    "CableSnap diagnostics",
    `phase: ${error.phase}`,
    `error: ${error.message}`,
    sentryEventId ? `sentry_event_id: ${sentryEventId}` : "sentry_event_id: (unavailable)",
    `time: ${now.toISOString()}`,
    "",
    "--- breadcrumb tail (recent console logs) ---",
    formatConsoleLogs(getRecentConsoleLogs()),
  ];
  return lines.join("\n");
}

/**
 * BLD-1257: Fullscreen recovery surface rendered when getDatabase() init has
 * permanently failed for the current JS session (typically Sentry
 * REACT-NATIVE-7 — NPE inside NativeDatabase.execAsync on Android).
 *
 * Mounted in app/_layout.tsx INSTEAD of the normal Stack tree so no
 * downstream effect / query / event handler can reach getDatabase() and
 * re-trigger the burst behaviour. Parallels the existing
 * WebUnsupportedScreen gate.
 *
 * Recovery semantics:
 *   - Retry: calls resetDatabaseInit() (via the parent hook) and re-runs
 *     getDatabase() on a fresh JS attempt. If the underlying issue was
 *     transient, the normal layout takes over.
 *   - Export diagnostics: surfaces the Sentry event id + phase via
 *     react-native Share so users can quote it in a bug report. No file
 *     copy required (per spec).
 */
export function DatabaseUnavailableScreen({ error, sentryEventId, onRetry }: Props) {
  const scheme = Appearance.getColorScheme() === "dark" ? "dark" : "light";
  const t = Colors[scheme];

  const handleExport = async () => {
    try {
      await Share.share({
        message: buildDatabaseDiagnostics(error, sentryEventId),
      });
    } catch {
      // Share dismissed or failed — no recovery path required.
    }
  };

  return (
    <View
      testID="database-unavailable-screen"
      style={[styles.container, { backgroundColor: t.background }]}
    >
      <View style={[styles.card, { backgroundColor: t.card }]}>
        <Text variant="heading" style={[styles.title, { color: t.foreground }]}>
          Workout data can&apos;t be opened right now.
        </Text>
        <Text variant="body" style={[styles.body, { color: t.mutedForeground }]}>
          Your workout database failed to open on this device. Your saved data
          is still on this phone — we just couldn&apos;t connect to it for this
          session. Tap Retry to try again. If the problem persists, share the
          diagnostics below so we can dig in.
        </Text>

        <View style={[styles.diag, { backgroundColor: t.muted }]}>
          <Text variant="caption" style={[styles.mono, { color: t.mutedForeground }]}>
            phase: {error.phase}
            {"\n"}
            event id: {sentryEventId ?? "(unavailable)"}
          </Text>
        </View>

        <Button
          variant="default"
          icon={RotateCcw}
          onPress={onRetry}
          style={styles.btn}
          accessibilityLabel="Retry opening the database"
          testID="database-unavailable-retry"
        >
          Retry
        </Button>
        <Button
          variant="outline"
          icon={Share2}
          onPress={handleExport}
          style={styles.btn}
          accessibilityLabel="Export diagnostics"
          testID="database-unavailable-export"
        >
          Export diagnostics
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    maxWidth: 560,
    width: "100%",
    padding: 24,
    borderRadius: 12,
  },
  title: {
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    marginBottom: 16,
    textAlign: "center",
  },
  diag: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: fontSizes.xs,
  },
  btn: {
    marginBottom: 12,
    width: "100%",
  },
});
