import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useExerciseDrawerStats } from "@/hooks/useExerciseDrawerStats";
import { toDisplay } from "@/lib/units";
import type { ExerciseRecords, ExerciseSession } from "@/lib/db/exercise-history";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  exerciseId: string;
  unit: "kg" | "lb";
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatWeight(kg: number, unit: "kg" | "lb"): string {
  return `${toDisplay(kg, unit)}${unit}`;
}

function formatVolume(kg: number, unit: "kg" | "lb"): string {
  const val = toDisplay(kg, unit);
  return val >= 1000
    ? `${(val / 1000).toFixed(1).replace(/\.0$/, "")}k${unit}`
    : `${val}${unit}`;
}

function unitLabel(unit: "kg" | "lb"): string {
  return unit === "lb" ? "pounds" : "kilograms";
}

function getBestDisplayAndA11y(
  records: ExerciseRecords,
  bestSet: { weight: number; reps: number } | null,
  unit: "kg" | "lb",
): { display: string; a11y: string } {
  if (bestSet && !records.is_bodyweight) {
    return {
      display: `${formatWeight(bestSet.weight, unit)}×${bestSet.reps}`,
      a11y: `Personal best: ${toDisplay(bestSet.weight, unit)} ${unitLabel(unit)} for ${bestSet.reps} reps`,
    };
  }
  if (records.max_duration != null && records.max_duration > 0) {
    const dur = formatDuration(records.max_duration);
    return { display: dur, a11y: `Personal best duration: ${dur}` };
  }
  if (records.max_reps != null) {
    return {
      display: `${records.max_reps} reps`,
      a11y: `Personal best: ${records.max_reps} reps`,
    };
  }
  return { display: "—", a11y: "No personal best recorded" };
}

function getE1rmDisplayAndA11y(
  records: ExerciseRecords,
  unit: "kg" | "lb",
): { display: string; a11y: string } {
  if (records.est_1rm != null && !records.is_bodyweight) {
    return {
      display: formatWeight(records.est_1rm, unit),
      a11y: `Estimated one rep max: ${toDisplay(records.est_1rm, unit)} ${unitLabel(unit)}`,
    };
  }
  return { display: "—", a11y: "No estimated one rep max" };
}

function renderLastSession(
  session: ExerciseSession,
  isBodyweight: boolean,
  unit: "kg" | "lb",
  colors: ReturnType<typeof useThemeColors>,
): React.ReactNode {
  const dateStr = new Date(session.started_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const lastBestStr = isBodyweight
    ? `${session.max_reps} reps`
    : `${formatWeight(session.max_weight, unit)} × ${session.max_reps}`;

  const volumeStr =
    !isBodyweight && session.volume > 0
      ? ` · Volume: ${formatVolume(session.volume, unit)}`
      : "";

  const lastA11y = `Last session on ${dateStr}: best set ${lastBestStr}, ${session.set_count} sets${volumeStr}`;

  return (
    <View style={styles.lastSession} accessibilityLabel={lastA11y}>
      <Text
        variant="body"
        style={[styles.lastSessionDate, { color: colors.onSurfaceVariant }]}
      >
        Last Session ({dateStr}):
      </Text>
      <Text variant="body" style={{ color: colors.onSurface }}>
        Best: {lastBestStr} · {session.set_count} sets{volumeStr}
      </Text>
    </View>
  );
}

export function ExerciseDrawerStats({ exerciseId, unit }: Props) {
  const colors = useThemeColors();
  const { records, bestSet, lastSession, loading, error } =
    useExerciseDrawerStats(exerciseId);

  if (loading) {
    return (
      <View
        style={styles.container}
        accessibilityLabel="Loading your exercise stats"
        accessibilityLiveRegion="polite"
      >
        <Text
          variant="caption"
          style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}
        >
          YOUR STATS
        </Text>
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceVariant }]}>
          <StatCell label="Best" value="—" colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
          <StatCell label="e1RM" value="—" colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
          <StatCell label="Sessions" value="—" colors={colors} />
        </View>
      </View>
    );
  }

  if (error || !records) {
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <Text
          variant="caption"
          style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}
        >
          YOUR STATS
        </Text>
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceVariant }]}>
          <StatCell label="Best" value="—" colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
          <StatCell label="e1RM" value="—" colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
          <StatCell label="Sessions" value="—" colors={colors} />
        </View>
      </View>
    );
  }

  const hasHistory = records.total_sessions > 0;

  if (!hasHistory) {
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <Text
          variant="caption"
          style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}
        >
          YOUR STATS
        </Text>
        <Text
          variant="body"
          style={[styles.emptyText, { color: colors.onSurfaceVariant }]}
          accessibilityLabel="No history yet. Complete your first set to see stats."
        >
          No history yet — complete your first set!
        </Text>
      </View>
    );
  }

  // Compute display values using extracted helpers
  const best = getBestDisplayAndA11y(records, bestSet, unit);
  const e1rm = getE1rmDisplayAndA11y(records, unit);
  const sessionsDisplay = `${records.total_sessions}`;
  const sessionsA11y = `${records.total_sessions} sessions completed`;

  // Last session
  const lastSessionContent = lastSession
    ? renderLastSession(lastSession, records.is_bodyweight, unit, colors)
    : null;

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <Text
        variant="caption"
        style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}
      >
        YOUR STATS
      </Text>
      <View style={[styles.statsRow, { backgroundColor: colors.surfaceVariant }]}>
        <StatCell
          label="Best"
          value={best.display}
          accessibilityLabel={best.a11y}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
        <StatCell
          label="e1RM"
          value={e1rm.display}
          accessibilityLabel={e1rm.a11y}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
        <StatCell
          label="Sessions"
          value={sessionsDisplay}
          accessibilityLabel={sessionsA11y}
          colors={colors}
        />
      </View>
      {lastSessionContent}
    </View>
  );
}

type StatCellProps = {
  label: string;
  value: string;
  accessibilityLabel?: string;
  colors: ReturnType<typeof useThemeColors>;
};

function StatCell({ label, value, accessibilityLabel, colors }: StatCellProps) {
  return (
    <View
      style={styles.statCell}
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
    >
      <Text
        variant="body"
        style={[styles.statLabel, { color: colors.onSurfaceVariant }]}
      >
        {label}
      </Text>
      <Text
        variant="body"
        style={[styles.statValue, { color: colors.onSurface }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: fontSizes.xs,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: fontSizes.xs,
    marginBottom: 2,
  },
  statValue: {
    fontSize: fontSizes.base,
    fontWeight: "600",
  },
  divider: {
    width: 1,
    height: 28,
  },
  lastSession: {
    marginTop: 10,
    paddingHorizontal: 4,
  },
  lastSessionDate: {
    fontSize: fontSizes.xs,
    marginBottom: 2,
  },
  emptyText: {
    fontSize: fontSizes.sm,
    fontStyle: "italic",
  },
});
