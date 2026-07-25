import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { CartesianChart, Line } from "victory-native";
import { ChartGate } from "@/components/ui/ChartGate";
import { useLayout } from "@/lib/layout";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { ImbalanceTrendPoint } from "@/lib/db/session-sets";

type TrendDirection = "narrowed" | "widened" | "held steady";

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
}

function computeDirection(startVal: number, endVal: number): TrendDirection {
  if (startVal - endVal >= 2) return "narrowed";
  if (endVal - startVal >= 2) return "widened";
  return "held steady";
}

function computeSummaryText(direction: TrendDirection, startVal: number, endVal: number, count: number): string {
  const end = Math.round(endVal);
  if (direction === "held steady") return `Imbalance held steady near ${end}% over ${count} sessions`;
  const start = Math.round(startVal);
  const verb = direction === "narrowed" ? "narrowed" : "widened";
  return `Imbalance ${verb} from ${start}% to ${end}% over your last ${count} sessions`;
}

function computeDominantSideText(side: ImbalanceTrendPoint["dominantSide"]): string {
  if (side === "left") return "Left side stronger";
  if (side === "right") return "Right side stronger";
  return "Both sides equal";
}

function computeA11ySide(side: ImbalanceTrendPoint["dominantSide"]): string {
  if (side === "left") return "Left side currently stronger";
  if (side === "right") return "Right side currently stronger";
  return "both sides currently equal";
}

function computeA11yLabel(
  direction: TrendDirection,
  startVal: number,
  endVal: number,
  count: number,
  side: ImbalanceTrendPoint["dominantSide"],
): string {
  const end = Math.round(endVal);
  const dirStr =
    direction === "held steady"
      ? `held steady near ${end}%`
      : `${direction} from ${Math.round(startVal)}% to ${end}%`;
  return `Imbalance trend: ${dirStr} over ${count} sessions. ${computeA11ySide(side)}.`;
}

type Props = {
  colors: ThemeColors;
  trend: ImbalanceTrendPoint[];
  loading: boolean;
  error: boolean;
  style?: object;
};

export default function ImbalanceTrendCard({
  colors,
  trend,
  loading,
  error,
  style,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const layout = useLayout();
  const chartWidth = layout.atLeastMedium ? Math.min((screenWidth - 80) / 2, 500) : screenWidth - 48;

  if (loading) {
    return (
      <Card style={[styles.card, style, { backgroundColor: colors.surface }]}>
        <CardContent>
          <ActivityIndicator testID="loading-indicator" style={styles.loader} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={[styles.card, style, { backgroundColor: colors.surface }]}>
        <CardContent>
          <View style={styles.errorBox}>
            <Text style={{ color: colors.error }}>Failed to load imbalance trend</Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  const count = trend.length;
  if (count < 3) {
    return (
      <Card style={[styles.card, style, { backgroundColor: colors.surface }]}>
        <CardContent>
          <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
            Imbalance Trend
          </Text>
          <Text variant="body" style={{ color: colors.onSurfaceVariant }} accessible={true}>
            Not enough data to show a trend yet — log a few more unilateral sessions with weighted loads on each side.
          </Text>
        </CardContent>
      </Card>
    );
  }

  // Calculate first vs last third averages
  const thirdSize = Math.max(1, Math.floor(count / 3));
  const firstThird = trend.slice(0, thirdSize);
  const lastThird = trend.slice(count - thirdSize);
  const startVal = firstThird.reduce((sum, p) => sum + p.diffPct, 0) / firstThird.length;
  const endVal = lastThird.reduce((sum, p) => sum + p.diffPct, 0) / lastThird.length;

  const direction = computeDirection(startVal, endVal);
  const summaryText = computeSummaryText(direction, startVal, endVal, count);

  const lastPoint = trend[count - 1];
  const dominantSideText = computeDominantSideText(lastPoint.dominantSide);
  const sides = trend.map((p) => p.dominantSide).filter((s) => s !== "equal");
  const hasFlipped = sides.length > 0 && sides.some((s) => s !== sides[0]);
  const captionText = `Most recent: ${dominantSideText}${hasFlipped ? " (side changed)" : ""}`;
  const a11yLabel = computeA11yLabel(direction, startVal, endVal, count, lastPoint.dominantSide);

  return (
    <Card style={[styles.card, style, { backgroundColor: colors.surface }]}>
      <CardContent>
        <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
          Imbalance Trend
        </Text>
        <View accessible={true} accessibilityLabel={a11yLabel}>
          <View
            accessible={false}
            importantForAccessibility="no"
            aria-hidden={true}
            style={{ width: chartWidth, height: 200 }}
          >
            <ChartGate>
              <CartesianChart
                data={trend.map((d) => ({ date: formatDate(d.startedAt), value: Math.round(d.diffPct) }))}
                xKey="date"
                yKeys={["value"]}
                domainPadding={{ left: 10, right: 10 }}
              >
                {({ points }) => (
                  <Line
                    points={points.value}
                    color={colors.secondary}
                    strokeWidth={2}
                    curveType="natural"
                  />
                )}
              </CartesianChart>
            </ChartGate>
          </View>
          <Text variant="body" style={{ color: colors.onSurface, marginTop: 8 }}>
            {summaryText}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
            {captionText}
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, borderRadius: 12 },
  loader: { paddingVertical: 24 },
  errorBox: { alignItems: "center", paddingVertical: 12 },
});
