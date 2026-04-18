import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { CartesianChart, Line } from "victory-native";
import { toDisplay } from "@/lib/units";
import { useLayout } from "@/lib/layout";
import type { ThemeColors } from "@/hooks/useThemeColors";

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
          {bw ? "Reps Progression" : "Weight Progression"}
        </Text>
        {!bw && chart.length >= 2 && (
          <View style={styles.chartToggle} accessibilityRole="radiogroup" accessibilityLabel="Chart data mode">
            <Chip selected={chartMode === "max"} onPress={() => setChartMode("max")} compact style={styles.chip}>Max Weight</Chip>
            <Chip selected={chartMode === "1rm"} onPress={() => setChartMode("1rm")} compact style={styles.chip}>Est. 1RM</Chip>
          </View>
        )}
        {chartLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : chartError ? (
          <View style={styles.errorBox}>
            <Text style={{ color: colors.error }}>Failed to load chart</Text>
            <Button variant="ghost" onPress={() => exerciseId && loadChart(exerciseId)} label="Retry" />
          </View>
        ) : activeChart.length < 2 ? (
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
            {activeChart.length === 0 ? "No data to chart yet" : "Log more sessions to see a trend chart"}
          </Text>
        ) : (
          <View accessibilityLabel={chartSummary ?? undefined}>
            <View style={{ width: chartWidth, height: 200 }}>
              <CartesianChart
                data={activeChart.map((d) => ({ date: formatDate(d.date), value: bw ? d.value : toDisplay(d.value, unit) }))}
                xKey="date" yKeys={["value"]} domainPadding={{ left: 10, right: 10 }}>
                {({ points }) => <Line points={points.value} color={colors.primary} strokeWidth={2} curveType="natural" />}
              </CartesianChart>
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
