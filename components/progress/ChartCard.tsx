import { StyleSheet, View, useWindowDimensions } from "react-native";
import { CartesianChart, Line } from "victory-native";
import { useLayout } from "../../lib/layout";
import { toDisplay } from "../../lib/units";
import { movingAvg } from "../../lib/format";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { useThemeColors } from "@/hooks/useThemeColors";
type ChartCardProps = {
  chart: { date: string; weight: number }[];
  unit: "kg" | "lb";
};

export function ChartCard({ chart, unit }: ChartCardProps) {
  const colors = useThemeColors();
  const layout = useLayout();
  const { width: screenWidth } = useWindowDimensions();

  const chartWidth = layout.atLeastMedium
    ? (screenWidth - 96) / 2 - 32
    : screenWidth - 48;

  const avg = movingAvg(chart);

  const paddedLabels = chart.map((d, i) => {
    if (chart.length <= 8) return d.date.slice(5);
    if (i % Math.ceil(chart.length / 6) === 0 || i === chart.length - 1)
      return d.date.slice(5);
    return "";
  });

  return (
    <Card style={styles.card}>
      <Text
        variant="subtitle"
        style={{ color: colors.onSurface, marginBottom: 12 }}
      >
        Weight Trend
      </Text>
      <View style={{ width: chartWidth, height: 200 }}>
        <CartesianChart
          data={chart.map((d, i) => ({
            date: paddedLabels[i] || "",
            weight: toDisplay(d.weight, unit),
            avg: avg[i]
              ? toDisplay(avg[i].avg, unit)
              : toDisplay(d.weight, unit),
          }))}
          xKey="date"
          yKeys={["weight", "avg"]}
          domainPadding={{ left: 10, right: 10 }}
        >
          {({ points }) => (
            <>
              <Line
                points={points.weight}
                color={colors.primary}
                strokeWidth={2}
                curveType="natural"
              />
              <Line
                points={points.avg}
                color={colors.tertiary}
                strokeWidth={2}
                curveType="natural"
              />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
        <Text variant="caption" style={{ color: colors.primary }}>
          ● Actual
        </Text>
        <Text variant="caption" style={{ color: colors.tertiary }}>
          ● 7-day avg
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
});
