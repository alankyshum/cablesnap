import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { LineChart } from "@/components/charts";
import { toDisplay } from "@/lib/units";
import { useLayout } from "@/lib/layout";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
}

type Props = {
  colors: ThemeColors;
  bw: boolean;
  unit: "kg" | "lb";
  chart: { date: number; value: number }[];
  chart1RM: { date: number; value: number }[];
  activeChart: { date: number; value: number }[];
  chartMode: "max" | "1rm";
  setChartMode: (m: "max" | "1rm") => void;
  chartLoading: boolean;
  chartError: boolean;
  exerciseId: string | undefined;
  exerciseName: string;
  loadChart: (id: string) => void;
  style?: object;
};

export default function ExerciseChartCard({
  colors, bw, unit, chart, activeChart, chartMode, setChartMode,
  chartLoading, chartError, exerciseId, exerciseName, loadChart, style,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const layout = useLayout();
  const chartWidth = layout.atLeastMedium ? Math.min((screenWidth - 80) / 2, 500) : screenWidth - 48;

  const chartSummary = activeChart.length >= 2
    ? (() => {
        const start = activeChart[0].value;
        const end = activeChart[activeChart.length - 1].value;
        const pct = start > 0 ? Math.round(((end - start) / start) * 100) : 0;
        const label = bw ? "reps" : unit;
        const sv = bw ? start : toDisplay(start, unit);
        const ev = bw ? end : toDisplay(end, unit);
        const dir = pct >= 0 ? "+" : "";
        const modeLabel = chartMode === "1rm" && !bw ? "estimated 1RM" : (bw ? "reps" : "max weight");
        return `Your ${exerciseName} ${modeLabel} progressed from ${sv}${label} to ${ev}${label} over ${activeChart.length} sessions (${dir}${pct}%)`;
      })()
    : null;

  return (
    <Card style={[styles.card, style, { backgroundColor: colors.surface }]}>
      <CardContent>
        <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
          {bw ? t({ id: "components.exercise.chart.reps-progression", message: "Reps Progression" }) : t({ id: "components.exercise.chart.weight-progression", message: "Weight Progression" })}
        </Text>
        {!bw && chart.length >= 2 && (
          <View style={styles.chartToggle} accessibilityRole="radiogroup" accessibilityLabel={t({ id: "components.exercise.chart.mode", message: "Chart data mode" })}>
            <Chip selected={chartMode === "max"} onPress={() => setChartMode("max")} compact style={styles.chip}>{t({ id: "components.exercise.chart.max-weight", message: "Max Weight" })}</Chip>
            <Chip selected={chartMode === "1rm"} onPress={() => setChartMode("1rm")} compact style={styles.chip}>{t({ id: "components.exercise.chart.est-1rm", message: "Est. 1RM" })}</Chip>
          </View>
        )}
        {chartLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : chartError ? (
          <View style={styles.errorBox}>
            <Text style={{ color: colors.error }}>{t({ id: "components.exercise.chart.error", message: "Failed to load chart" })}</Text>
            <Button variant="ghost" onPress={() => exerciseId && loadChart(exerciseId)} label={t({ id: "components.exercise.chart.retry", message: "Retry" })} />
          </View>
        ) : activeChart.length < 2 ? (
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
            {activeChart.length === 0 ? t({ id: "components.exercise.chart.empty", message: "No data to chart yet" }) : t({ id: "components.exercise.chart.more-data", message: "Log more sessions to see a trend chart" })}
          </Text>
        ) : (
          <View accessibilityLabel={chartSummary ?? undefined}>
            <View style={{ width: chartWidth, height: 200 }}>
              <LineChart
                labels={activeChart.map((d) => formatDate(d.date))}
                series={[{
                  key: "value",
                  values: activeChart.map((d) => (bw ? d.value : toDisplay(d.value, unit))),
                  color: colors.primary,
                  strokeWidth: 2,
                  curve: "natural",
                  showPoints: false,
                }]}
                padding={{ left: 10, right: 10 }}
                height={200}
                width={chartWidth}
              />
            </View>
            {chartSummary && <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>{chartSummary}</Text>}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, borderRadius: 12 },
  loader: { paddingVertical: 24 },
  errorBox: { alignItems: "center", paddingVertical: 12 },
  chartToggle: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: { marginBottom: 0 },
});
