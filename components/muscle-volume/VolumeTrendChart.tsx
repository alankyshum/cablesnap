import React, { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { CardContent } from "@/components/ui/card";
import { LineChart } from "@/components/charts";
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

export default function VolumeTrendChart({
  selected,
  trend,
  hasEnoughTrend,
  chartWidth,
  reduced,
  colors,
}: Props) {
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
        <View style={chartContainerStyle}>
          <LineChart
            labels={data.map((point) => point.week)}
            series={[{
              key: "sets",
              values: data.map((point) => point.sets),
              color: colors.primary,
              strokeWidth: 2,
              curve: reduced ? "linear" : "natural",
              showPoints: false,
            }]}
            {...(chartWidth != null ? { width: chartWidth } : {})}
            padding={{ left: 16, right: 16, top: 12, bottom: 8 }}
            height={180}
            xAxis={{
              tickCount: xTickCount,
              labelColor: colors.onSurfaceVariant,
              lineColor: colors.outlineVariant,
              labelOffset: 4,
              fontSize: 10,
            }}
            yAxis={{
              tickCount: 4,
              labelColor: colors.onSurfaceVariant,
              lineColor: colors.outlineVariant,
              labelOffset: 4,
              fontSize: 10,
              formatLabel: (v) => `${Math.round(Number(v))}`,
            }}
            testID="volume-trend-chart"
          />
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
