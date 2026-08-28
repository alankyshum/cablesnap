import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useColor } from "@/hooks/useColor";
import { formatDuration } from "@/lib/format";
import { toDisplay } from "@/lib/units";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";

type Props = {
  colors: ThemeColors;
  totalVolume: number;
  previousWeekVolume: number | null;
  totalDurationSeconds: number;
  sessionCount: number;
  unitSystem: "kg" | "lb";
};

function formatVolume(volume: number, unitSystem: "kg" | "lb"): string {
  const displayed = toDisplay(volume, unitSystem);
  if (displayed >= 100_000) {
    return `${Math.round(displayed / 1000)}K ${unitSystem}`;
  }
  return `${displayed.toLocaleString()} ${unitSystem}`;
}

function computeDelta(current: number, previous: number | null): { text: string; positive: boolean } | null {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return pct > 0
    ? { text: `↑${pct}%`, positive: true }
    : { text: `↓${Math.abs(pct)}%`, positive: false };
}

function buildAccessibilityLabel(
  sessionCount: number,
  totalVolume: number,
  unitSystem: "kg" | "lb",
  delta: { text: string; positive: boolean } | null,
  totalDurationSeconds: number,
): string {
  if (sessionCount === 0) return t({ id: "home.weeklySummary.emptyA11y", message: "This week: no training data yet" });

  const vol = toDisplay(totalVolume, unitSystem);
  const unitLabel = unitSystem === "lb" ? t({ id: "home.weeklySummary.pounds", message: "pounds" }) : t({ id: "home.weeklySummary.kilograms", message: "kilograms" });
  const dur = formatDuration(totalDurationSeconds);

  let label = t({ id: "home.weeklySummary.volumeA11y", message: `This week: ${vol.toLocaleString()} ${unitLabel} total volume` });
  if (delta) {
    label += `, ${i18n._({ id: "home.weeklySummary.delta", message: "{direction, select, up {up} down {down}} {percent} from last week", values: { direction: delta.positive ? "up" : "down", percent: delta.text.replace(/[↑↓]/, "") } })}`;
  }
  label += `, ${t({ id: "home.weeklySummary.durationA11y", message: `${dur} total training time` })}`;
  return label;
}

export default function WeeklySummaryCard({
  colors,
  totalVolume,
  previousWeekVolume,
  totalDurationSeconds,
  sessionCount,
  unitSystem,
}: Props) {
  const greenColor = useColor("green");
  const delta = computeDelta(totalVolume, previousWeekVolume);
  const isEmpty = sessionCount === 0;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface }]}
      accessibilityRole="summary"
      accessibilityLabel={buildAccessibilityLabel(sessionCount, totalVolume, unitSystem, delta, totalDurationSeconds)}
    >
      <Text variant="caption" style={[styles.title, { color: colors.onSurfaceVariant }]}>
        {t({ id: "home.weeklySummary.title", message: "This Week" })}
      </Text>
      {isEmpty ? (
        <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
          {t({ id: "home.weeklySummary.empty", message: "No training data yet" })}
        </Text>
      ) : (
        <View style={styles.metricsRow}>
          <Text style={[styles.volume, { color: colors.onBackground }]}>
            {formatVolume(totalVolume, unitSystem)}
          </Text>
          {delta != null && (
            <Text
              style={[
                styles.delta,
                { color: delta.positive ? greenColor : colors.error },
              ]}
            >
              {delta.text}
            </Text>
          )}
          <Text style={[styles.separator, { color: colors.onSurfaceVariant }]}>·</Text>
          <Text style={[styles.duration, { color: colors.onSurfaceVariant }]}>
            {t({ id: "home.weeklySummary.duration", message: `${formatDuration(totalDurationSeconds)} this week` })}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontWeight: "600",
    marginBottom: 4,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
  },
  volume: {
    fontSize: 14,
    fontWeight: "700",
  },
  delta: {
    fontSize: 12,
    fontWeight: "600",
  },
  separator: {
    fontSize: 14,
  },
  duration: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 14,
  },
});
