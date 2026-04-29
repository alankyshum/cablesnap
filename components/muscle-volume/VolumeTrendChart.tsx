import React, { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { CardContent } from "@/components/ui/card";
import { CartesianChart, Line } from "victory-native";
import { matchFont } from "@shopify/react-native-skia";
import type { MuscleGroup } from "../../lib/types";
import { MUSCLE_LABELS } from "../../lib/types";
import type { TrendRow } from "../../hooks/useMuscleVolume";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  selected: MuscleGroup | null;
  trend: TrendRow[];
  hasEnoughTrend: boolean;
  /** Optional pixel width. When omitted, the chart fills its parent. */
  chartWidth?: number;
  reduced: boolean;
  colors: ThemeColors;
};

// Resolve a small font for axis tick labels. matchFont gracefully falls back to
// the system default when the requested family is not available — sufficient
// for plain numeric/short-string ticks, and avoids bundling a custom font.
function useAxisFont() {
  return useMemo(() => {
    try {
      return matchFont({ fontFamily: "System", fontSize: 10 });
    } catch {
      return null;
    }
  }, []);
}

export default function VolumeTrendChart({
  selected,
  trend,
  hasEnoughTrend,
  chartWidth,
  reduced,
  colors,
}: Props) {
  const axisFont = useAxisFont();
  const data = useMemo(
    () => trend.map((t) => ({ week: t.week, sets: t.sets })),
    [trend]
  );

  // Show every-other tick on X axis when we have many points, to avoid clutter.
  const xTickCount = useMemo(() => {
    if (data.length <= 4) return data.length || 1;
    return Math.ceil(data.length / 2);
  }, [data.length]);

  const chartContainerStyle = chartWidth != null
    ? { width: chartWidth, height: 180 }
    : { width: "100%" as const, height: 180 };

  return (
    <CardContent>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 4 }}>
        {selected ? `${MUSCLE_LABELS[selected]} — 8 Week Trend` : "Weekly Trend"}
      </Text>
      {hasEnoughTrend ? (
        <View style={chartContainerStyle} testID="volume-trend-chart">
          <CartesianChart
            data={data}
            xKey="week"
            yKeys={["sets"]}
            domainPadding={{ left: 16, right: 16, top: 12, bottom: 8 }}
            xAxis={{
              font: axisFont,
              tickCount: xTickCount,
              labelColor: colors.onSurfaceVariant,
              lineColor: colors.outlineVariant,
              labelOffset: 4,
            }}
            yAxis={[
              {
                font: axisFont,
                tickCount: 4,
                labelColor: colors.onSurfaceVariant,
                lineColor: colors.outlineVariant,
                // Sets are always whole numbers — round and drop fractional ticks.
                formatYLabel: (v) => `${Math.round(Number(v))}`,
                labelOffset: 4,
              },
            ]}
          >
            {({ points }) => (
              <Line
                points={points.sets}
                color={colors.primary}
                strokeWidth={2}
                curveType={reduced ? "linear" : "natural"}
              />
            )}
          </CartesianChart>
        </View>
      ) : (
        <Text
          variant="body"
          style={{
            color: colors.onSurfaceVariant,
            textAlign: "center",
            padding: 24,
          }}
        >
          Keep training to see your trends
        </Text>
      )}
    </CardContent>
  );
}
